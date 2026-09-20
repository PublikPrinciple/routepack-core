import type { ArtifactSpec, RouteGateRequirement, RoutePack } from "../../../src/index.js"
import type { RouteGraphDefinition, RouteStackDefinition } from "./types.js"

const VERSION = "1.0.0"

const STAGES = [
  ["demand", "intake", "request.capture", "Demand captured"],
  ["qualification", "qualification", "source.verify", "Inputs qualified"],
  ["routing", "planning", "route.resolve", "Production route resolved"],
  ["material-pull", "operation", "materials.read", "Approved materials assembled"],
  ["assembly", "transformation", "package.assemble", "Execution package assembled"],
  ["generation", "generation", "image.generate", "Candidate artifact generated"],
  ["qa", "verification", "quality.review", "Artifact conformance verified"],
  ["polish", "transformation", "artifact.edit", "Artifact finish completed"],
  ["preflight", "verification", "preflight.run", "Release build validated"],
  ["freeze", "operation", "release.seal", "Release frozen"],
  ["authorization", "authorization", "release.authorize", "Release authorized"],
  ["deployment", "deployment", "release.deploy", "Artifact deployed"],
  ["field-verification", "verification", "field.verify", "Experienced output verified"],
  ["observation", "observation", "telemetry.observe", "Production evidence recorded"],
  ["learning", "learning", "route.learn", "Learning proposal recorded"],
] as const

function gatesFor(stage: string): RouteGateRequirement[] {
  if (stage === "qualification") return [{ id: "source-evidence", kind: "evidence", phase: "start", description: "Required source context is present and conflicts are resolved." }]
  if (stage === "qa") return [{ id: "qa-conformance", kind: "quality", phase: "completion", description: "Required conformance checks pass with release-blocking defects at zero." }]
  if (stage === "authorization") return [{ id: "human-release", kind: "authority", phase: "start", description: "The designated human authority approves this frozen release." }]
  if (stage === "deployment") return [{ id: "target-ready", kind: "system", phase: "start", description: "The target environment passed production preflight." }]
  if (stage === "field-verification") return [{ id: "field-conformance", kind: "quality", phase: "completion", description: "The experienced output conforms in its real environment." }]
  return []
}

function artifactsFor(stage: string): ArtifactSpec[] {
  if (stage === "generation") {
    return [{ id: "candidate-artifact", kind: "image", title: "Candidate editorial image", requiredFor: "transition", acceptanceCriteria: ["source-grounded", "ready for QA"] }]
  }
  if (stage === "freeze") {
    return [{ id: "release-manifest", kind: "manifest", title: "Frozen release and conformance manifest", requiredFor: "completion", acceptanceCriteria: ["content-addressed", "dependencies recorded"] }]
  }
  return []
}

function stagePack(stage: typeof STAGES[number]): RoutePack {
  const [id, kind, capability, outcome] = stage
  const gates = gatesFor(id)
  return {
    identity: { id: `RP-DES-${id.toUpperCase()}`, version: VERSION, domain: "design", kind, owner: "CivikStack" },
    purpose: { intent: `Advance design production through ${id}`, expectedOutcome: outcome, supportedIntents: ["create", "generate", "produce"] },
    entry: { requiredInputKeys: ["message"] },
    transformation: {
      topology: "sequence",
      actions: [{
        id,
        summary: outcome,
        capability,
        ...(gates.some((gate) => gate.phase === "start" || gate.phase === "execution") ? { requiredGateIds: gates.filter((gate) => gate.phase !== "completion").map((gate) => gate.id) } : {}),
      }],
    },
    constraints: {
      invariants: ["Protected source intent may not drift during transformation.", "Every consequential action remains attributable."],
      prohibitedStates: ["unattributed-output", "unauthorized-release"],
      requiredGates: gates,
    },
    resources: {
      roles: ["route-operator"],
      systems: ["rpos"],
      knowledge: ["approved source context", "design expression profile"],
      permittedCapabilities: [capability],
    },
    outputs: {
      resultingState: id === "learning" ? "learning-recorded" : `${id}-complete`,
      artifacts: artifactsFor(id),
      eventTypes: [`design.${id}.completed`],
      downstreamRouteKinds: id === "learning" ? [] : [STAGES[STAGES.findIndex((candidate) => candidate[0] === id) + 1]?.[1] ?? ""].filter(Boolean),
    },
    verification: { evidenceRequirements: gates.filter((gate) => gate.kind === "evidence").map((gate) => gate.description), acceptanceCriteria: [outcome] },
    exceptions: { escalation: `Escalate unresolved ${id} conditions to the designated route owner.`, recovery: `Resume ${id} from the last accepted continuity state.`, rollback: `Restore the preceding sealed route state before ${id}.` },
    telemetry: { measures: [`${id}.success`], timing: [`${id}.duration`], failureSignals: [`${id}.failed`] },
    learning: { reviewTrigger: `Repeated ${id} failure or approved exception`, updateAuthority: "RoutePack steward" },
  }
}

export function designProductionBlueprint(): {
  routePacks: RoutePack[]
  routeGraphs: RouteGraphDefinition[]
  routeStacks: RouteStackDefinition[]
} {
  const routePacks = STAGES.map(stagePack)
  const graph: RouteGraphDefinition = {
    id: "RG-DES-EDITORIAL-IMAGE",
    version: VERSION,
    name: "Editorial image production",
    description: "Demand through qualification, generation, conformance, release, field verification, and learning.",
    domain: "design",
    topology: "sequence",
    supportedIntents: ["create", "generate", "produce"],
    objectKinds: ["visual_asset", "image", "artifact"],
    nodes: STAGES.map(([id], index) => ({
      id,
      routePackId: `RP-DES-${id.toUpperCase()}`,
      routePackVersion: VERSION,
      dependsOn: index === 0 ? [] : [STAGES[index - 1]![0]],
    })),
  }
  const stack: RouteStackDefinition = {
    id: "RS-DESIGN-PRODUCTION",
    version: VERSION,
    name: "Design production stack",
    domain: "design",
    description: "Reusable design-generation, release, observation, and learning capability.",
    graphs: [{ id: graph.id, version: graph.version }],
    status: "approved",
  }
  return { routePacks, routeGraphs: [graph], routeStacks: [stack] }
}

export function designProductionCapabilities(): string[] {
  return STAGES.map(([, , capability]) => capability)
}
