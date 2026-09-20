import type {
  ExecutionRecord,
  ExecutionRequest,
  GateRecord,
  GateStatus,
  RoutePack,
  RouteRelease,
  RouteRequest,
  RouteSession,
  SessionStatus,
  ValidationIssue,
} from "./contracts.js"
import { validateRoutePack } from "./validation.js"

export interface SessionStartResult {
  session: RouteSession
  validationIssues: ValidationIssue[]
}

function toGateRecords(pack: RoutePack): GateRecord[] {
  return pack.constraints.requiredGates.map((gate) => ({ ...gate, status: "open" }))
}

function hasOpenGates(session: RouteSession, phase: "start" | "execution" | "completion"): boolean {
  return session.gates.some((gate) => gate.phase === phase && gate.status === "open")
}

function nextStatus(session: RouteSession): SessionStatus {
  if (session.status === "cancelled" || session.status === "completed") return session.status
  if (session.gates.some((gate) => gate.status === "rejected")) return "blocked"
  if (hasOpenGates(session, "start")) return "awaiting-gates"
  return "active"
}

export function startRouteSession(input: {
  id: string
  release: RouteRelease
  request: RouteRequest
  initialState: string
  startedAt: string
}): SessionStartResult {
  const validation = validateRoutePack(input.release.snapshot)
  const session: RouteSession = {
    id: input.id,
    release: input.release,
    request: input.request,
    status: validation.valid ? "active" : "blocked",
    state: input.initialState,
    gates: toGateRecords(input.release.snapshot),
    executions: [],
    startedAt: input.startedAt,
  }
  return { session: { ...session, status: validation.valid ? nextStatus(session) : "blocked" }, validationIssues: validation.issues }
}

export function resolveGate(input: {
  session: RouteSession
  gateId: string
  status: Exclude<GateStatus, "open">
  actor: string
  at: string
  note?: string
}): RouteSession {
  const found = input.session.gates.find((gate) => gate.id === input.gateId)
  if (!found) throw new Error(`Unknown gate: ${input.gateId}`)
  if (found.status !== "open") throw new Error(`Gate ${input.gateId} is already ${found.status}`)
  const gates = input.session.gates.map((gate) =>
    gate.id === input.gateId
      ? { ...gate, status: input.status, resolvedBy: input.actor, resolvedAt: input.at, ...(input.note ? { note: input.note } : {}) }
      : gate,
  )
  const candidate = { ...input.session, gates }
  return { ...candidate, status: nextStatus(candidate) }
}

function actionFor(pack: RoutePack, actionId: string | undefined) {
  return actionId ? pack.transformation.actions.find((action) => action.id === actionId) : undefined
}

function record(session: RouteSession, request: ExecutionRequest, at: string, disposition: ExecutionRecord["disposition"], reason?: string): RouteSession {
  const execution: ExecutionRecord = { ...request, requestedAt: at, disposition, ...(reason ? { reason } : {}) }
  return { ...session, executions: [...session.executions, execution] }
}

/**
 * Authorizes a proposed operation only. An adapter may execute it after this
 * result is accepted; the core never obtains tools or performs side effects.
 */
export function requestExecution(session: RouteSession, request: ExecutionRequest, at: string): RouteSession {
  if (session.status !== "active") {
    return record(session, request, at, "awaiting-gates", `Route session is ${session.status}`)
  }
  const pack = session.release.snapshot
  if (!pack.resources.permittedCapabilities.includes(request.capability)) {
    return record(session, request, at, "denied", `Capability is not permitted: ${request.capability}`)
  }
  const action = actionFor(pack, request.actionId)
  if (request.actionId && !action) {
    return record(session, request, at, "denied", `Unknown RoutePack action: ${request.actionId}`)
  }
  const openRequiredGate = (action?.requiredGateIds ?? []).find(
    (gateId) => session.gates.find((gate) => gate.id === gateId)?.status === "open",
  )
  if (hasOpenGates(session, "execution") || openRequiredGate) {
    return record(session, request, at, "awaiting-gates", "An execution gate remains open")
  }
  return record(session, request, at, "accepted")
}

export function completeRouteSession(session: RouteSession, state: string, completedAt: string): RouteSession {
  if (session.status !== "active") {
    throw new Error(`Cannot complete a ${session.status} route session`)
  }
  if (hasOpenGates(session, "completion")) {
    throw new Error("Cannot complete a route session with open completion gates")
  }
  return { ...session, state, status: "completed", completedAt }
}
