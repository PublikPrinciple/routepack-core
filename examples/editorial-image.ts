import { applyContinuityDelta, openRouteRun, requestExecution, resolveGate, RouteRegistry, type RoutePack } from "../src/index.js"

const editorialImageRoute: RoutePack = {
  identity: { id: "design.editorial-image", version: "1.0.0", domain: "design", kind: "generation", owner: "CivikStack" },
  purpose: {
    intent: "create",
    expectedOutcome: "A source-grounded, approved editorial image.",
    supportedIntents: ["create"],
  },
  entry: { requiredInputKeys: ["brief", "sourceIds"], authority: "Design lead" },
  transformation: {
    topology: "sequence",
    actions: [
      { id: "source", summary: "Assemble approved source context", capability: "source.read", requiredGateIds: ["source-grounded"] },
      { id: "generate", summary: "Generate editorial image", capability: "image.generate", requiredGateIds: ["source-grounded"] },
      { id: "review", summary: "Run visual QA", capability: "quality.review" },
    ],
  },
  constraints: {
    invariants: ["Source claims remain attributable.", "No artifact is released without a human approval."],
    prohibitedStates: ["released-without-approval"],
    requiredGates: [
      { id: "source-grounded", kind: "evidence", phase: "start", description: "Source context is present and resolved." },
      { id: "release-approval", kind: "authority", phase: "completion", description: "Design lead approves public release." },
    ],
  },
  resources: {
    roles: ["design-director", "reviewer"],
    systems: ["asset-registry", "image-generator"],
    knowledge: ["CivikStack expression profile"],
    permittedCapabilities: ["source.read", "image.generate", "quality.review"],
  },
  outputs: {
    resultingState: "approved-artifact",
    artifacts: [{ id: "editorial-image", kind: "image", title: "Editorial image", requiredFor: "completion", acceptanceCriteria: ["brand review passes"] }],
    eventTypes: ["artifact.created", "artifact.approved"],
    downstreamRouteKinds: ["release"],
  },
  verification: { evidenceRequirements: ["approved source bundle"], acceptanceCriteria: ["brand review passes"] },
  exceptions: { escalation: "Ask design lead to resolve source or quality conflicts.", recovery: "Revise from the Continuity Capsule.", rollback: "Restore the preceding approved artifact version." },
  telemetry: { measures: ["review cycles"], timing: ["time to approved artifact"], failureSignals: ["source conflict", "brand failure"] },
  learning: { reviewTrigger: "Repeated visual-QA failure", updateAuthority: "Design system steward" },
}

const registry = new RouteRegistry()
registry.register(editorialImageRoute)

const run = await openRouteRun({
  registry,
  routeId: editorialImageRoute.identity.id,
  request: {
    id: "req-001",
    intent: "create",
    object: "visual_asset",
    domain: "design",
    sourceContextRequired: true,
    requestedCapabilities: ["source.read", "image.generate"],
    input: { brief: "Announce the Access Reliability Lab", sourceIds: ["brief-17"] },
  },
  initialState: "requested",
  baseState: { objective: "Announce the Access Reliability Lab", sourceIds: ["brief-17"] },
  sessionId: "session-001",
  capsuleId: "capsule-001",
  at: "2026-09-20T12:00:00.000Z",
})

const ready = resolveGate({ session: run.session, gateId: "source-grounded", status: "accepted", actor: "researcher-01", at: "2026-09-20T12:01:00.000Z" })
const authorized = requestExecution(ready, { id: "exec-001", actionId: "generate", capability: "image.generate", payload: {} }, "2026-09-20T12:02:00.000Z")
const capsule = applyContinuityDelta(run.capsule, {
  id: "delta-001",
  kind: "execution",
  at: "2026-09-20T12:02:00.000Z",
  actor: "rpos",
  rationale: "Generation request accepted by the bounded route session.",
  patch: { generation: { executionId: "exec-001", status: authorized.executions.at(-1)?.disposition } },
})

console.log({ route: authorized.release.routeId, session: authorized.status, artifacts: run.artifacts.length, continuityDeltas: capsule.deltas.length })
