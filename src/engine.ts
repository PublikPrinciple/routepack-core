import type { ArtifactObligation, ContinuityCapsule, RoutePack, RouteRequest, RouteSession } from "./contracts.js"
import { createContinuityCapsule } from "./continuity.js"
import { sealRoutePack } from "./release.js"
import { RouteRegistry } from "./registry.js"
import { startRouteSession } from "./session.js"

export function deriveArtifactObligations(pack: RoutePack, routeSessionId: string): ArtifactObligation[] {
  return pack.outputs.artifacts.map((spec) => ({
    id: `${routeSessionId}:${spec.id}`,
    routeSessionId,
    routeId: pack.identity.id,
    spec,
    status: "required",
  }))
}

export interface RouteRun {
  session: RouteSession
  capsule: ContinuityCapsule
  artifacts: ArtifactObligation[]
}

/**
 * RPOS's minimal orchestration boundary: resolve a matching route, seal the
 * exact contract, open a bounded session, and create the resulting work.
 */
export async function openRouteRun(input: {
  registry: RouteRegistry
  routeId: string
  routeVersion?: string
  request: RouteRequest
  initialState: string
  baseState: Record<string, unknown>
  sessionId: string
  capsuleId: string
  at: string
}): Promise<RouteRun> {
  const candidates = input.registry.list().filter((candidate) => candidate.identity.id === input.routeId)
  const pack = input.routeVersion
    ? candidates.find((candidate) => candidate.identity.version === input.routeVersion)
    : candidates.length === 1
      ? candidates[0]
      : undefined
  if (!input.routeVersion && candidates.length > 1) {
    throw new Error(`RoutePack version selection required: ${input.routeId}`)
  }
  if (!pack) throw new Error(`RoutePack not found: ${input.routeId}`)
  if (pack.identity.domain !== input.request.domain || !pack.purpose.supportedIntents.includes(input.request.intent)) {
    throw new Error("Route request does not match the requested RoutePack")
  }

  const release = await sealRoutePack(pack, input.at)
  const started = startRouteSession({
    id: input.sessionId,
    release,
    request: input.request,
    initialState: input.initialState,
    startedAt: input.at,
  })
  const capsule = createContinuityCapsule({
    id: input.capsuleId,
    routeSessionId: started.session.id,
    release,
    baseState: input.baseState,
  })
  return {
    session: started.session,
    capsule,
    artifacts: deriveArtifactObligations(pack, started.session.id),
  }
}
