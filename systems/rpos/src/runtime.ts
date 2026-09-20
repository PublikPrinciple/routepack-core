import { randomUUID } from "node:crypto"

export interface RposRuntime {
  now(): string
  nextId(prefix: string): string
}

export function createNodeRuntime(): RposRuntime {
  return {
    now: () => new Date().toISOString(),
    nextId: (prefix) => `${prefix}-${randomUUID()}`,
  }
}
