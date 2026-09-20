import type { ContinuityCapsule, ContinuityDelta, JsonRecord, RouteRelease } from "./contracts.js"

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function merge(base: JsonRecord, patch: JsonRecord): JsonRecord {
  const result: JsonRecord = clone(base)
  for (const [key, value] of Object.entries(patch)) {
    const current = result[key]
    result[key] = isRecord(current) && isRecord(value) ? merge(current, value) : clone(value)
  }
  return result
}

export function createContinuityCapsule(input: {
  id: string
  routeSessionId: string
  release: RouteRelease
  baseState: JsonRecord
}): ContinuityCapsule {
  const baseState = clone(input.baseState)
  return {
    id: input.id,
    routeSessionId: input.routeSessionId,
    routeRelease: {
      routeId: input.release.routeId,
      version: input.release.version,
      contentHash: input.release.contentHash,
    },
    baseState,
    currentState: clone(baseState),
    deltas: [],
  }
}

/** Appends an auditable delta without mutating the original capsule. */
export function applyContinuityDelta(capsule: ContinuityCapsule, delta: ContinuityDelta): ContinuityCapsule {
  if (capsule.deltas.some((existing) => existing.id === delta.id)) {
    throw new Error(`Continuity delta already exists: ${delta.id}`)
  }
  return {
    ...capsule,
    currentState: merge(capsule.currentState, delta.patch),
    deltas: [...capsule.deltas, clone(delta)],
  }
}
