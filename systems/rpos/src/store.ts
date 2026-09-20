import type { RposState } from "./types.js"

export interface RposStore {
  load(): Promise<RposState>
  save(state: RposState): Promise<void>
}

export function emptyRposState(): RposState {
  return {
    routePacks: [],
    routeGraphs: [],
    routeStacks: [],
    graphRuns: [],
    sessions: [],
    sessionCapsules: [],
    sharedCapsules: [],
    artifactObligations: [],
    artifacts: [],
    executionOutcomes: [],
    organizations: [],
    organizationAnalyses: [],
    audit: [],
  }
}

const clone = <T>(value: T): T => structuredClone(value)

export class InMemoryRposStore implements RposStore {
  private state: RposState

  constructor(initial: RposState = emptyRposState()) {
    this.state = clone(initial)
  }

  async load(): Promise<RposState> {
    return clone(this.state)
  }

  async save(state: RposState): Promise<void> {
    this.state = clone(state)
  }
}
