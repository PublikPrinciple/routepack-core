import type { RoutePack } from "../../../src/index.js"
import type {
  FunctionalFamily,
  FunctionClassification,
  OrganizationAnalysis,
  OrganizationFunctionObservation,
  OrganizationObservation,
} from "./types.js"

export const FUNCTIONAL_FAMILIES: readonly FunctionalFamily[] = ["govern", "sense", "plan", "operate", "deliver", "generate", "learn"]

const SIGNALS: Record<FunctionalFamily, readonly string[]> = {
  govern: ["approve", "authority", "budget", "compliance", "govern", "policy", "risk", "standard"],
  sense: ["assess", "audit", "discover", "evidence", "inspect", "investigate", "monitor", "research"],
  plan: ["design", "option", "plan", "prioritize", "procure", "schedule", "strategy"],
  operate: ["admin", "facility", "finance", "hr", "internal", "maintain", "operate", "support"],
  deliver: ["care", "construct", "customer", "deliver", "educate", "resident", "service", "ship"],
  generate: ["artifact", "content", "create", "document", "email", "generate", "image", "produce", "report", "video"],
  learn: ["evaluate", "improve", "kaizen", "learn", "postmortem", "repair", "revise", "training"],
}

const KIND_FAMILY: Record<string, FunctionalFamily> = {
  authorization: "govern",
  decision: "govern",
  verification: "sense",
  observation: "sense",
  qualification: "sense",
  planning: "plan",
  operate: "operate",
  operation: "operate",
  transfer: "deliver",
  delivery: "deliver",
  deployment: "deliver",
  generation: "generate",
  transformation: "generate",
  learning: "learn",
  recovery: "learn",
}

function classify(fn: OrganizationFunctionObservation): Pick<FunctionClassification, "family" | "confidence" | "basis" | "status"> {
  if (fn.declaredFamily) {
    return { family: fn.declaredFamily, confidence: 1, basis: ["human-declared family"], status: "confirmed" }
  }
  const haystack = `${fn.name} ${fn.description}`.toLowerCase()
  const ranked = FUNCTIONAL_FAMILIES.map((family) => ({
    family,
    matches: SIGNALS[family].filter((signal) => haystack.includes(signal)),
  })).sort((a, b) => b.matches.length - a.matches.length)
  const winner = ranked[0]
  const runnerUp = ranked[1]
  if (!winner || winner.matches.length === 0) return { family: null, confidence: 0, basis: [], status: "unknown" }
  const tied = runnerUp?.matches.length === winner.matches.length
  return {
    family: tied ? null : winner.family,
    confidence: tied ? 0.35 : Math.min(0.85, 0.45 + winner.matches.length * 0.15),
    basis: winner.matches,
    status: tied ? "unknown" : "proposed",
  }
}

function familyForPack(pack: RoutePack): FunctionalFamily | null {
  return KIND_FAMILY[pack.identity.kind.toLowerCase()] ?? null
}

export function analyzeOrganization(input: {
  id: string
  at: string
  observation: OrganizationObservation
  routePacks: RoutePack[]
}): OrganizationAnalysis {
  const classifications = input.observation.functions.map<FunctionClassification>((fn) => {
    const result = classify(fn)
    const candidateRoutePackIds = result.family
      ? input.routePacks.filter((pack) => familyForPack(pack) === result.family).map((pack) => pack.identity.id)
      : []
    return { functionId: fn.id, ...result, candidateRoutePackIds }
  })
  const representedFamilies = FUNCTIONAL_FAMILIES.filter((family) => classifications.some((item) => item.family === family))
  return {
    id: input.id,
    organizationId: input.observation.id,
    createdAt: input.at,
    status: "proposed",
    classifications,
    representedFamilies,
    missingFamilies: FUNCTIONAL_FAMILIES.filter((family) => !representedFamilies.includes(family)),
    unknownFunctionIds: classifications.filter((item) => item.status === "unknown").map((item) => item.functionId),
  }
}
