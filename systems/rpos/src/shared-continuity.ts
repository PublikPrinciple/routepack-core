import type { ContinuityDelta, JsonRecord } from "../../../src/index.js"
import type { SharedContinuityCapsule } from "./types.js"

const clone = <T>(value: T): T => structuredClone(value)

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function merge(base: JsonRecord, patch: JsonRecord): JsonRecord {
  const output = clone(base)
  for (const [key, value] of Object.entries(patch)) {
    const current = output[key]
    output[key] = isRecord(current) && isRecord(value) ? merge(current, value) : clone(value)
  }
  return output
}

export function createSharedCapsule(input: {
  id: string
  graphRunId: string
  graphId: string
  graphVersion: string
  baseState: JsonRecord
}): SharedContinuityCapsule {
  return {
    id: input.id,
    graphRunId: input.graphRunId,
    graphId: input.graphId,
    graphVersion: input.graphVersion,
    baseState: clone(input.baseState),
    currentState: clone(input.baseState),
    deltas: [],
  }
}

export function applySharedDelta(capsule: SharedContinuityCapsule, delta: ContinuityDelta): SharedContinuityCapsule {
  if (capsule.deltas.some((existing) => existing.id === delta.id)) throw new Error(`Shared continuity delta already exists: ${delta.id}`)
  return {
    ...capsule,
    currentState: merge(capsule.currentState, delta.patch),
    deltas: [...capsule.deltas, clone(delta)],
  }
}
