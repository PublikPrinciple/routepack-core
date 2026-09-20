/**
 * Portable, domain-neutral contracts for the RoutePack Operating System.
 *
 * A RoutePack describes a governed transition. It does not execute a model,
 * tool, or external system; it defines the contract an execution adapter must
 * satisfy before it is allowed to do so.
 */

export type JsonRecord = Record<string, unknown>

export type RouteTopology =
  | "sequence"
  | "branch"
  | "join"
  | "parallel"
  | "loop"
  | "gate"
  | "event-driven"
  | "network"
  | "adaptive"

export type GateKind = "evidence" | "policy" | "authority" | "quality" | "system"
export type GateStatus = "open" | "accepted" | "rejected" | "waived"
export type GatePhase = "start" | "execution" | "completion"
export type SessionStatus = "blocked" | "awaiting-gates" | "active" | "completed" | "cancelled"
export type ContinuityDeltaKind = "intent" | "evidence" | "decision" | "artifact" | "gate" | "state" | "execution"

export interface RouteIdentity {
  id: string
  version: string
  domain: string
  kind: string
  owner: string
}

export interface RoutePurpose {
  intent: string
  expectedOutcome: string
  supportedIntents: string[]
}

export interface RouteEntry {
  requiredState?: string
  requiredInputKeys: string[]
  authority?: string
}

export interface RouteAction {
  id: string
  summary: string
  capability: string
  decisionRule?: string
  dependsOn?: string[]
  requiredGateIds?: string[]
}

export interface RouteTransformation {
  topology: RouteTopology
  actions: RouteAction[]
}

export interface RouteGateRequirement {
  id: string
  kind: GateKind
  phase: GatePhase
  description: string
}

export interface RouteConstraints {
  invariants: string[]
  prohibitedStates: string[]
  requiredGates: RouteGateRequirement[]
}

export interface RouteResources {
  roles: string[]
  systems: string[]
  knowledge: string[]
  permittedCapabilities: string[]
}

export interface ArtifactSpec {
  id: string
  kind: string
  title: string
  requiredFor: "transition" | "completion" | "downstream"
  acceptanceCriteria: string[]
}

export interface RouteOutputs {
  resultingState: string
  artifacts: ArtifactSpec[]
  eventTypes: string[]
  downstreamRouteKinds: string[]
}

export interface RouteVerification {
  evidenceRequirements: string[]
  acceptanceCriteria: string[]
}

export interface RouteExceptions {
  escalation: string
  recovery: string
  rollback: string
}

export interface RouteTelemetry {
  measures: string[]
  timing: string[]
  failureSignals: string[]
}

export interface RouteLearning {
  reviewTrigger: string
  updateAuthority: string
}

/** A complete, portable transition contract. */
export interface RoutePack {
  identity: RouteIdentity
  purpose: RoutePurpose
  entry: RouteEntry
  transformation: RouteTransformation
  constraints: RouteConstraints
  resources: RouteResources
  outputs: RouteOutputs
  verification: RouteVerification
  exceptions: RouteExceptions
  telemetry: RouteTelemetry
  learning: RouteLearning
}

export interface RouteRequest {
  id: string
  intent: string
  object: string
  domain: string
  sourceContextRequired: boolean
  requestedCapabilities: string[]
  input: JsonRecord
}

export interface RouteRelease {
  routeId: string
  version: string
  sealedAt: string
  contentHash: string
  snapshot: RoutePack
}

export interface GateRecord {
  id: string
  kind: GateKind
  phase: GatePhase
  description: string
  status: GateStatus
  resolvedBy?: string
  resolvedAt?: string
  note?: string
}

export interface ContinuityDelta {
  id: string
  kind: ContinuityDeltaKind
  at: string
  actor: string
  patch: JsonRecord
  rationale: string
}

/**
 * Durable operating state. It is deliberately separate from any model's
 * conversation history, so a route can resume with another model or client.
 */
export interface ContinuityCapsule {
  id: string
  routeSessionId: string
  routeRelease: Pick<RouteRelease, "routeId" | "version" | "contentHash">
  baseState: JsonRecord
  currentState: JsonRecord
  deltas: ContinuityDelta[]
}

export interface ExecutionRequest {
  id: string
  capability: string
  actionId?: string
  payload: JsonRecord
}

export interface ExecutionRecord extends ExecutionRequest {
  requestedAt: string
  disposition: "accepted" | "denied" | "awaiting-gates"
  reason?: string
}

export interface RouteSession {
  id: string
  release: RouteRelease
  request: RouteRequest
  status: SessionStatus
  state: string
  gates: GateRecord[]
  executions: ExecutionRecord[]
  startedAt: string
  completedAt?: string
}

export interface ArtifactObligation {
  id: string
  routeSessionId: string
  routeId: string
  spec: ArtifactSpec
  status: "required"
}

export interface ValidationIssue {
  path: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}
