import {
  applyContinuityDelta,
  completeRouteSession,
  openRouteRun,
  requestExecution,
  resolveGate,
  RouteRegistry,
  assertValidRoutePack,
  type ContinuityDelta,
  type ExecutionRequest,
  type GateStatus,
  type JsonRecord,
  type RoutePack,
  type RouteRequest,
  type RouteSession,
} from "../../../src/index.js"
import { appendAuditEvent } from "./audit.js"
import { ExecutionAdapterRegistry, type AdapterExecutionResult } from "./adapters.js"
import { RuleBasedInteractionLayer } from "./interpreter.js"
import { analyzeOrganization as classifyOrganization } from "./organization.js"
import { attachNodeSession, createGraphRun, syncNodeSession, unlockReadyNodes, validateRouteGraph } from "./route-graph.js"
import { applySharedDelta, createSharedCapsule } from "./shared-continuity.js"
import type { RposStore } from "./store.js"
import type {
  ExecutionDispatch,
  ExecutionOutcome,
  InteractionEnvelope,
  InteractionInterpretation,
  InteractionSubmission,
  OrganizationAnalysis,
  OrganizationObservation,
  RouteGraphDefinition,
  RouteGraphRun,
  RouteResolution,
  RouteStackDefinition,
  RposRunView,
  RposState,
  SharedContinuityCapsule,
} from "./types.js"
import type { RposRuntime } from "./runtime.js"

const packKey = (pack: Pick<RoutePack, "identity">) => `${pack.identity.id}@${pack.identity.version}`
const graphKey = (graph: Pick<RouteGraphDefinition, "id" | "version">) => `${graph.id}@${graph.version}`

export interface RposBlueprint {
  routePacks: RoutePack[]
  routeGraphs: RouteGraphDefinition[]
  routeStacks: RouteStackDefinition[]
}

export class RposService {
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly store: RposStore,
    private readonly adapters: ExecutionAdapterRegistry,
    private readonly runtime: RposRuntime,
    private readonly interactionLayer = new RuleBasedInteractionLayer(),
  ) {}

  private transact<T>(operation: (state: RposState) => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(async () => {
      const state = await this.store.load()
      const result = await operation(state)
      await this.store.save(state)
      return result
    })
    this.operationQueue = run.then(() => undefined, () => undefined)
    return run
  }

  private async audit(state: RposState, actor: string, action: string, subject: string, data: JsonRecord = {}): Promise<void> {
    await appendAuditEvent(state, {
      id: this.runtime.nextId("audit"),
      at: this.runtime.now(),
      actor,
      action,
      subject,
      data,
    })
  }

  async installBlueprint(blueprint: RposBlueprint, actor = "system.bootstrap"): Promise<void> {
    await this.transact(async (state) => {
      for (const pack of blueprint.routePacks) assertValidRoutePack(pack)
      const stagedPacks = [...state.routePacks]
      for (const pack of blueprint.routePacks) {
        if (!stagedPacks.some((candidate) => packKey(candidate) === packKey(pack))) stagedPacks.push(pack)
      }
      const releases = new Set(stagedPacks.map(packKey))
      for (const graph of blueprint.routeGraphs) {
        const validation = validateRouteGraph(graph, releases)
        if (!validation.valid) throw new Error(`Invalid RouteGraph ${graphKey(graph)}: ${validation.issues.join("; ")}`)
      }
      const stagedGraphs = [...state.routeGraphs]
      for (const graph of blueprint.routeGraphs) {
        if (!stagedGraphs.some((candidate) => graphKey(candidate) === graphKey(graph))) stagedGraphs.push(graph)
      }
      const graphReleases = new Set(stagedGraphs.map(graphKey))
      for (const stack of blueprint.routeStacks) {
        for (const graph of stack.graphs) {
          if (!graphReleases.has(`${graph.id}@${graph.version}`)) throw new Error(`RouteStack ${stack.id} references unknown graph ${graph.id}@${graph.version}`)
        }
      }
      const stagedStacks = [...state.routeStacks]
      for (const stack of blueprint.routeStacks) {
        const key = `${stack.id}@${stack.version}`
        if (!stagedStacks.some((candidate) => `${candidate.id}@${candidate.version}` === key)) stagedStacks.push(stack)
      }
      state.routePacks = stagedPacks
      state.routeGraphs = stagedGraphs
      state.routeStacks = stagedStacks
      await this.audit(state, actor, "blueprint.installed", "rpos", {
        routePacks: blueprint.routePacks.map(packKey),
        routeGraphs: blueprint.routeGraphs.map(graphKey),
        routeStacks: blueprint.routeStacks.map((stack) => `${stack.id}@${stack.version}`),
      })
    })
  }

  interpretInteraction(envelope: InteractionEnvelope): InteractionInterpretation {
    return this.interactionLayer.interpret(envelope, envelope.id ?? this.runtime.nextId("request"))
  }

  async submitInteraction(envelope: InteractionEnvelope, preferredGraphKey?: string): Promise<InteractionSubmission> {
    const interpretation = this.interpretInteraction(envelope)
    if (!interpretation.request) return { interpretation }
    const resolution = await this.submitRequest(interpretation.request, envelope.actor, preferredGraphKey)
    return { interpretation, resolution }
  }

  async submitRequest(request: RouteRequest, actor: string, preferredGraphKey?: string): Promise<RouteResolution> {
    return this.transact(async (state) => {
      const candidates = state.routeGraphs.filter((graph) =>
        graph.domain === request.domain && graph.supportedIntents.includes(request.intent) && graph.objectKinds.includes(request.object),
      )
      const candidateGraphKeys = candidates.map(graphKey)
      if (candidates.length === 0) {
        await this.audit(state, actor, "request.unmatched", request.id, { domain: request.domain, intent: request.intent, object: request.object })
        return { status: "unmatched", candidateGraphKeys: [], reason: "No RouteGraph matches the request contract" }
      }
      const selected = preferredGraphKey
        ? candidates.find((graph) => graphKey(graph) === preferredGraphKey)
        : candidates.length === 1
          ? candidates[0]
          : undefined
      if (!selected) {
        await this.audit(state, actor, "request.selection-required", request.id, { candidateGraphKeys })
        return { status: "selection-required", candidateGraphKeys, reason: "More than one RouteGraph matches; human selection is required" }
      }
      const runId = this.runtime.nextId("run")
      const capsuleId = this.runtime.nextId("continuity")
      const at = this.runtime.now()
      const run = createGraphRun({ id: runId, graph: selected, request, sharedCapsuleId: capsuleId, at })
      const sharedCapsule = createSharedCapsule({
        id: capsuleId,
        graphRunId: run.id,
        graphId: selected.id,
        graphVersion: selected.version,
        baseState: {
          objective: request.object,
          intent: request.intent,
          sourceContextRequired: request.sourceContextRequired,
          requestInput: request.input,
          protected: {},
          routes: {},
          executions: {},
        },
      })
      state.graphRuns.push(run)
      state.sharedCapsules.push(sharedCapsule)
      await this.audit(state, actor, "graph-run.started", run.id, { graph: graphKey(selected), requestId: request.id })
      return { status: "started", candidateGraphKeys, run }
    })
  }

  async startNode(graphRunId: string, nodeId: string, actor: string): Promise<RouteSession> {
    return this.transact(async (state) => {
      const runIndex = state.graphRuns.findIndex((run) => run.id === graphRunId)
      if (runIndex < 0) throw new Error(`Graph run not found: ${graphRunId}`)
      const run = state.graphRuns[runIndex]
      if (!run) throw new Error(`Graph run not found: ${graphRunId}`)
      const graph = state.routeGraphs.find((candidate) => candidate.id === run.graphId && candidate.version === run.graphVersion)
      if (!graph) throw new Error(`RouteGraph release not found: ${run.graphId}@${run.graphVersion}`)
      const node = graph.nodes.find((candidate) => candidate.id === nodeId)
      if (!node) throw new Error(`Graph node not found: ${nodeId}`)
      const pack = state.routePacks.find((candidate) => candidate.identity.id === node.routePackId && candidate.identity.version === node.routePackVersion)
      if (!pack) throw new Error(`RoutePack release not found: ${node.routePackId}@${node.routePackVersion}`)
      const sharedIndex = state.sharedCapsules.findIndex((capsule) => capsule.id === run.sharedCapsuleId)
      const shared = state.sharedCapsules[sharedIndex]
      if (!shared) throw new Error(`Shared Continuity Capsule not found: ${run.sharedCapsuleId}`)

      const registry = new RouteRegistry()
      for (const routePack of state.routePacks) registry.register(routePack)
      const opened = await openRouteRun({
        registry,
        routeId: pack.identity.id,
        routeVersion: pack.identity.version,
        request: run.request,
        initialState: pack.entry.requiredState ?? "ready",
        baseState: shared.currentState,
        sessionId: this.runtime.nextId("session"),
        capsuleId: this.runtime.nextId("capsule"),
        at: this.runtime.now(),
      })
      state.sessions.push(opened.session)
      state.sessionCapsules.push(opened.capsule)
      state.artifactObligations.push(...opened.artifacts)
      state.graphRuns[runIndex] = attachNodeSession(run, nodeId, opened.session)
      state.sharedCapsules[sharedIndex] = applySharedDelta(shared, this.delta(actor, "state", "RoutePack node session opened", {
        routes: { [nodeId]: { routePack: packKey(pack), sessionId: opened.session.id, status: opened.session.status } },
      }))
      await this.audit(state, actor, "route-session.started", opened.session.id, { graphRunId, nodeId, routePack: packKey(pack) })
      return opened.session
    })
  }

  async resolveSessionGate(input: {
    sessionId: string
    gateId: string
    status: Exclude<GateStatus, "open">
    actor: string
    note?: string
  }): Promise<RouteSession> {
    return this.transact(async (state) => {
      const sessionIndex = state.sessions.findIndex((session) => session.id === input.sessionId)
      const session = state.sessions[sessionIndex]
      if (!session) throw new Error(`Route session not found: ${input.sessionId}`)
      const updated = resolveGate({
        session,
        gateId: input.gateId,
        status: input.status,
        actor: input.actor,
        at: this.runtime.now(),
        ...(input.note ? { note: input.note } : {}),
      })
      state.sessions[sessionIndex] = updated
      this.syncRunForSession(state, updated)
      this.applySessionAndSharedDelta(state, updated, this.delta(input.actor, "gate", `Gate ${input.gateId} ${input.status}`, {
        gates: { [input.gateId]: { status: input.status, actor: input.actor } },
      }))
      await this.audit(state, input.actor, `gate.${input.status}`, `${input.sessionId}:${input.gateId}`, {})
      return updated
    })
  }

  async dispatchExecution(sessionId: string, request: ExecutionRequest, actor: string): Promise<ExecutionDispatch> {
    const authorization = await this.transact(async (state) => {
      const sessionIndex = state.sessions.findIndex((session) => session.id === sessionId)
      const session = state.sessions[sessionIndex]
      if (!session) throw new Error(`Route session not found: ${sessionId}`)
      const existingOutcome = state.executionOutcomes.find((outcome) => outcome.routeSessionId === sessionId && outcome.executionRequestId === request.id)
      if (existingOutcome) return { session, outcome: existingOutcome, continuity: this.sharedForSession(state, sessionId) }
      const existingRecord = session.executions.find((execution) => execution.id === request.id)
      const updated = existingRecord ? session : requestExecution(session, request, this.runtime.now())
      state.sessions[sessionIndex] = updated
      this.syncRunForSession(state, updated)
      if (!existingRecord) {
        await this.audit(state, actor, `execution.${updated.executions.at(-1)?.disposition ?? "unknown"}`, request.id, {
          sessionId,
          capability: request.capability,
        })
      }
      return { session: updated, continuity: this.sharedForSession(state, sessionId) }
    })

    if (authorization.outcome) return { session: authorization.session, request, outcome: authorization.outcome }
    const execution = authorization.session.executions.find((record) => record.id === request.id)
    if (execution?.disposition !== "accepted") return { session: authorization.session, request }

    const adapter = this.adapters.resolve(request.capability)
    let result: AdapterExecutionResult
    let outcomeStatus: ExecutionOutcome["status"]
    if (!adapter) {
      result = { status: "failed", output: {}, evidence: [], artifacts: [], error: `No execution adapter registered for ${request.capability}` }
      outcomeStatus = "adapter-unavailable"
    } else {
      try {
        result = await adapter.execute(request, { session: authorization.session, continuity: authorization.continuity })
        outcomeStatus = result.status
      } catch (error) {
        result = { status: "failed", output: {}, evidence: [], artifacts: [], error: error instanceof Error ? error.message : "Execution adapter failed" }
        outcomeStatus = "failed"
      }
    }

    return this.transact(async (state) => {
      const duplicate = state.executionOutcomes.find((outcome) => outcome.routeSessionId === sessionId && outcome.executionRequestId === request.id)
      const session = state.sessions.find((candidate) => candidate.id === sessionId)
      if (!session) throw new Error(`Route session not found: ${sessionId}`)
      if (duplicate) return { session, request, outcome: duplicate }
      const outcome: ExecutionOutcome = {
        id: this.runtime.nextId("outcome"),
        routeSessionId: sessionId,
        executionRequestId: request.id,
        capability: request.capability,
        status: outcomeStatus,
        output: result.output,
        evidence: result.evidence,
        artifacts: result.artifacts,
        completedAt: this.runtime.now(),
        ...(result.error ? { error: result.error } : {}),
      }
      state.executionOutcomes.push(outcome)
      const run = state.graphRuns.find((candidate) => candidate.nodes.some((node) => node.routeSessionId === sessionId))
      if (!run) throw new Error(`Graph run not found for session: ${sessionId}`)
      for (const artifact of result.artifacts) {
        const obligation = state.artifactObligations.find((candidate) =>
          candidate.routeSessionId === sessionId
          && candidate.spec.kind === artifact.kind
          && !state.artifacts.some((registered) => registered.obligationId === candidate.id),
        )
        state.artifacts.push({
          ...artifact,
          id: this.runtime.nextId("artifact"),
          routeSessionId: sessionId,
          graphRunId: run.id,
          executionOutcomeId: outcome.id,
          routeReleaseHash: session.release.contentHash,
          status: "registered",
          registeredAt: this.runtime.now(),
          ...(obligation ? { obligationId: obligation.id } : {}),
        })
      }
      this.applySessionAndSharedDelta(state, session, this.delta(actor, "execution", `Execution ${outcome.status}`, {
        executions: { [request.id]: outcome },
      }))
      await this.audit(state, actor, `execution.${outcome.status}`, request.id, { sessionId, capability: request.capability })
      return { session, request, outcome }
    })
  }

  async completeNode(sessionId: string, resultingState: string, actor: string): Promise<RouteGraphRun> {
    return this.transact(async (state) => {
      const sessionIndex = state.sessions.findIndex((session) => session.id === sessionId)
      const session = state.sessions[sessionIndex]
      if (!session) throw new Error(`Route session not found: ${sessionId}`)
      const successfulRequestIds = new Set(
        state.executionOutcomes
          .filter((outcome) => outcome.routeSessionId === sessionId && outcome.status === "succeeded")
          .map((outcome) => outcome.executionRequestId),
      )
      const successfulActionIds = new Set(
        session.executions
          .filter((execution) => execution.actionId && successfulRequestIds.has(execution.id))
          .map((execution) => execution.actionId),
      )
      const missingActions = session.release.snapshot.transformation.actions
        .map((action) => action.id)
        .filter((actionId) => !successfulActionIds.has(actionId))
      if (missingActions.length > 0) {
        throw new Error(`Cannot complete route session; successful execution is missing for actions: ${missingActions.join(", ")}`)
      }
      const completed = completeRouteSession(session, resultingState, this.runtime.now())
      state.sessions[sessionIndex] = completed
      const runIndex = state.graphRuns.findIndex((run) => run.nodes.some((node) => node.routeSessionId === sessionId))
      const run = state.graphRuns[runIndex]
      if (!run) throw new Error(`Graph run not found for session: ${sessionId}`)
      const graph = state.routeGraphs.find((candidate) => candidate.id === run.graphId && candidate.version === run.graphVersion)
      if (!graph) throw new Error(`RouteGraph release not found: ${run.graphId}@${run.graphVersion}`)
      const synced = syncNodeSession(run, completed)
      const unlocked = unlockReadyNodes(synced, graph)
      state.graphRuns[runIndex] = unlocked
      this.applySessionAndSharedDelta(state, completed, this.delta(actor, "state", "RoutePack node completed", {
        routes: { [session.release.routeId]: { sessionId, state: resultingState, status: "completed" } },
      }))
      await this.audit(state, actor, "route-session.completed", sessionId, { graphRunId: run.id, resultingState })
      return unlocked
    })
  }

  async analyzeOrganization(observation: OrganizationObservation, actor: string): Promise<OrganizationAnalysis> {
    return this.transact(async (state) => {
      const analysis = classifyOrganization({
        id: this.runtime.nextId("org-analysis"),
        at: this.runtime.now(),
        observation,
        routePacks: state.routePacks,
      })
      const existingIndex = state.organizations.findIndex((candidate) => candidate.id === observation.id)
      if (existingIndex >= 0) state.organizations[existingIndex] = observation
      else state.organizations.push(observation)
      state.organizationAnalyses.push(analysis)
      await this.audit(state, actor, "organization.analyzed", observation.id, {
        analysisId: analysis.id,
        status: analysis.status,
        unknownFunctionIds: analysis.unknownFunctionIds,
      })
      return analysis
    })
  }

  async getRunView(graphRunId: string): Promise<RposRunView> {
    await this.operationQueue
    const state = await this.store.load()
    const run = state.graphRuns.find((candidate) => candidate.id === graphRunId)
    if (!run) throw new Error(`Graph run not found: ${graphRunId}`)
    const graph = state.routeGraphs.find((candidate) => candidate.id === run.graphId && candidate.version === run.graphVersion)
    if (!graph) throw new Error(`RouteGraph release not found: ${run.graphId}@${run.graphVersion}`)
    const continuity = state.sharedCapsules.find((capsule) => capsule.id === run.sharedCapsuleId)
    if (!continuity) throw new Error(`Shared Continuity Capsule not found: ${run.sharedCapsuleId}`)
    const nodes = graph.nodes.map((node) => {
      const status = run.nodes.find((candidate) => candidate.nodeId === node.id)
      const routePack = state.routePacks.find((pack) => pack.identity.id === node.routePackId && pack.identity.version === node.routePackVersion)
      if (!status || !routePack) throw new Error(`Graph node state is incomplete: ${node.id}`)
      const session = status.routeSessionId ? state.sessions.find((candidate) => candidate.id === status.routeSessionId) : undefined
      return {
        node,
        status: status.status,
        routePack: routePack.identity,
        ...(session ? { session } : {}),
        obligations: session ? state.artifactObligations.filter((artifact) => artifact.routeSessionId === session.id) : [],
        artifacts: session ? state.artifacts.filter((artifact) => artifact.routeSessionId === session.id) : [],
      }
    })
    return {
      run,
      graph,
      nodes,
      continuity,
      outstandingGates: state.sessions
        .filter((session) => run.nodes.some((node) => node.routeSessionId === session.id))
        .flatMap((session) => session.gates.filter((gate) => gate.status === "open").map((gate) => ({
          sessionId: session.id,
          gateId: gate.id,
          kind: gate.kind,
          description: gate.description,
        }))),
    }
  }

  async snapshot(): Promise<RposState> {
    await this.operationQueue
    return this.store.load()
  }

  private delta(actor: string, kind: ContinuityDelta["kind"], rationale: string, patch: JsonRecord): ContinuityDelta {
    return { id: this.runtime.nextId("delta"), kind, at: this.runtime.now(), actor, rationale, patch }
  }

  private syncRunForSession(state: RposState, session: RouteSession): void {
    const runIndex = state.graphRuns.findIndex((run) => run.nodes.some((node) => node.routeSessionId === session.id))
    const run = state.graphRuns[runIndex]
    if (run) state.graphRuns[runIndex] = syncNodeSession(run, session)
  }

  private sharedForSession(state: RposState, sessionId: string): SharedContinuityCapsule {
    const run = state.graphRuns.find((candidate) => candidate.nodes.some((node) => node.routeSessionId === sessionId))
    if (!run) throw new Error(`Graph run not found for session: ${sessionId}`)
    const shared = state.sharedCapsules.find((capsule) => capsule.id === run.sharedCapsuleId)
    if (!shared) throw new Error(`Shared Continuity Capsule not found: ${run.sharedCapsuleId}`)
    return shared
  }

  private applySessionAndSharedDelta(state: RposState, session: RouteSession, delta: ContinuityDelta): void {
    const capsuleIndex = state.sessionCapsules.findIndex((capsule) => capsule.routeSessionId === session.id)
    const capsule = state.sessionCapsules[capsuleIndex]
    if (capsule) state.sessionCapsules[capsuleIndex] = applyContinuityDelta(capsule, delta)
    const run = state.graphRuns.find((candidate) => candidate.nodes.some((node) => node.routeSessionId === session.id))
    if (!run) return
    const sharedIndex = state.sharedCapsules.findIndex((capsule) => capsule.id === run.sharedCapsuleId)
    const shared = state.sharedCapsules[sharedIndex]
    if (shared) state.sharedCapsules[sharedIndex] = applySharedDelta(shared, { ...delta, id: this.runtime.nextId("shared-delta") })
  }
}
