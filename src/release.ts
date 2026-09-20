import type { RoutePack, RouteRelease } from "./contracts.js"
import { assertValidRoutePack } from "./validation.js"

function canonicalize(value: unknown): string {
  if (value === null) return "null"
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value)
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("RoutePack content cannot contain non-finite numbers")
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`
  }
  throw new TypeError(`RoutePack content cannot contain ${typeof value}`)
}

function clone<T>(value: T): T {
  return JSON.parse(canonicalize(value)) as T
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * Produces an immutable, content-addressed release. The timestamp records when
 * the release was made; it is intentionally excluded from the content hash.
 */
export async function sealRoutePack(pack: RoutePack, sealedAt: string): Promise<RouteRelease> {
  assertValidRoutePack(pack)
  const snapshot = clone(pack)
  return {
    routeId: snapshot.identity.id,
    version: snapshot.identity.version,
    sealedAt,
    contentHash: await sha256Hex(canonicalize(snapshot)),
    snapshot,
  }
}

export { canonicalize }
