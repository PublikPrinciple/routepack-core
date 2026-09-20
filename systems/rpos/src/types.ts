import type {
  ArtifactObligation,
  ContinuityCapsule,
  ContinuityDelta,
  ExecutionRequest,
  JsonRecord,
  RoutePack,
  RouteRequest,
  RouteSession,
  RouteTopology,
} from "../../../src/index.js"

export type FunctionalFamily = "govern" | "sense" | "plan" | "operate" | "deliver" | "generate" | "learn"

export type RouteArchetype =
  | "intake"
  | "qualification"
  | "transformation"
  | "decision"
  | "authorization"
  | "transfer"
  | "verification"
  | "generation"
  | "deployment"
  | "observation"
  | "recovery"
  | "learning"

export interface RouteGraphNode {
  id: string
  routePackId: string
  routePackVersion: string
  dependsOn: string[]
  optional?: boolean
}

export interface RouteGraphDefinition {
  id: string
  version: string
  name: string
  description: string
  domain: string
  topology: RouteTopology
  supportedIntents: string[]
  objectKinds: string[]
  nodes: RouteGraphNode[]
}

export interface RouteStackDefinition {
  id: string
  version: string
  name: string
  domain: string
  description: string
  graphs: Array<{ id: string; version: string }>
  status: "proposed" | "approved" | "retired"
}

export type GraphNodeRunStatus = "pending" | "ready" | "awaiting-gates" | "active" | "completed" | "blocked"
export type GraphRunStatus = "active" | "awaiting-gates" | "completed" | "blocked" | "cancelled"

export interface GraphNodeRun {
  nodeId: string
  status: GraphNodeRunStatus
  routeSessionId?: string
}

export interface RouteGraphRun {
  id: string
  graphId: string
  graphVersion: string
  request: RouteRequest
  status: GraphRunStatus
  nodes: GraphNodeRun[]
  sharedCapsuleId: string
  startedAt: string
  completedAt?: string
}

export interface SharedContinuityCapsule {
  id: string
  graphRunId: string
  graphId: string
  graphVersion: string
  baseState: JsonRecord
  currentState: JsonRecord
  deltas: ContinuityDelta[]
}

export interface ExecutionOutcome {
  id: string
  routeSessionId: string
  executionRequestId: string
  capability: string
  status: "succeeded" | "failed" | "adapter-unavailable"
  output: JsonRecord
  evidence: string[]
  artifacts: ProducedArtifact[]
  completedAt: string
  error?: string
}

export interface ProducedArtifact {
  ref: string
  kind: string
  title: string
  metadata?: JsonRecord
}

export interface RegisteredArtifact extends ProducedArtifact {
  id: string
  routeSessionId: string
  graphRunId: string
  executionOutcomeId: string
  routeReleaseHash: string
  status: "registered"
  registeredAt: string
  obligationId?: string
}

export interface AuditEvent {
  sequence: number
  id: string
  at: string
  actor: string
  action: string
  subject: string
  data: JsonRecord
  previousHash: string
  hash: string
}

export interface OrganizationFunctionObservation {
  id: string
  name: string
  description: string
  evidenceRefs: string[]
  declaredFamily?: FunctionalFamily
}

export interface OrganizationObservation {
  id: string
  name: string
  sector: string
  observedAt: string
  sourceRefs: string[]
  functions: OrganizationFunctionObservation[]
}

export interface FunctionClassification {
  functionId: string
  family: FunctionalFamily | null
  confidence: number
  basis: string[]
  status: "confirmed" | "proposed" | "unknown"
  candidateRoutePackIds: string[]
}

export interface OrganizationAnalysis {
  id: string
  organizationId: string
  createdAt: string
  status: "proposed"
  classifications: FunctionClassification[]
  representedFamilies: FunctionalFamily[]
  missingFamilies: FunctionalFamily[]
  unknownFunctionIds: string[]
}

export interface InteractionHints {
  intent?: string
  object?: string
  domain?: string
  sourceContextRequired?: boolean
  requestedCapabilities?: string[]
  input?: JsonRecord
}

export interface InteractionEnvelope {
  id?: string
  message: string
  actor: string
  hints?: InteractionHints
}

export interface InteractionInterpretation {
  status: "interpreted" | "needs-clarification"
  confidence: number
  unknowns: string[]
  rationale: string[]
  request?: RouteRequest
}

export type RouteResolution =
  | { status: "unmatched"; candidateGraphKeys: []; reason: string }
  | { status: "selection-required"; candidateGraphKeys: string[]; reason: string }
  | { status: "started"; candidateGraphKeys: string[]; run: RouteGraphRun }

export interface InteractionSubmission {
  interpretation: InteractionInterpretation
  resolution?: RouteResolution
}

export interface ExecutionDispatch {
  session: RouteSession
  request: ExecutionRequest
  outcome?: ExecutionOutcome
}

export interface RposState {
  routePacks: RoutePack[]
  routeGraphs: RouteGraphDefinition[]
  routeStacks: RouteStackDefinition[]
  graphRuns: RouteGraphRun[]
  sessions: RouteSession[]
  sessionCapsules: ContinuityCapsule[]
  sharedCapsules: SharedContinuityCapsule[]
  artifactObligations: ArtifactObligation[]
  artifacts: RegisteredArtifact[]
  executionOutcomes: ExecutionOutcome[]
  organizations: OrganizationObservation[]
  organizationAnalyses: OrganizationAnalysis[]
  audit: AuditEvent[]
}

export interface RposRunView {
  run: RouteGraphRun
  graph: RouteGraphDefinition
  nodes: Array<{
    node: RouteGraphNode
    status: GraphNodeRunStatus
    routePack: Pick<RoutePack["identity"], "id" | "version" | "domain" | "kind" | "owner">
    session?: RouteSession
    obligations: ArtifactObligation[]
    artifacts: RegisteredArtifact[]
  }>
  continuity: SharedContinuityCapsule
  outstandingGates: Array<{ sessionId: string; gateId: string; kind: string; description: string }>
}
