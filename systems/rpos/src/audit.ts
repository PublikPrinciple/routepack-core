import { canonicalize } from "../../../src/index.js"
import type { JsonRecord } from "../../../src/index.js"
import type { AuditEvent, RposState } from "./types.js"

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function appendAuditEvent(state: RposState, input: {
  id: string
  at: string
  actor: string
  action: string
  subject: string
  data?: JsonRecord
}): Promise<AuditEvent> {
  const previous = state.audit.at(-1)
  const unsigned = {
    sequence: (previous?.sequence ?? 0) + 1,
    id: input.id,
    at: input.at,
    actor: input.actor,
    action: input.action,
    subject: input.subject,
    data: input.data ?? {},
    previousHash: previous?.hash ?? "GENESIS",
  }
  const event: AuditEvent = { ...unsigned, hash: await sha256Hex(canonicalize(unsigned)) }
  state.audit.push(event)
  return event
}

export async function verifyAuditChain(events: AuditEvent[]): Promise<boolean> {
  let previousHash = "GENESIS"
  for (const event of events) {
    if (event.previousHash !== previousHash) return false
    const { hash, ...unsigned } = event
    if (await sha256Hex(canonicalize(unsigned)) !== hash) return false
    previousHash = event.hash
  }
  return true
}
