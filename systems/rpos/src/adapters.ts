import type { ExecutionRequest, JsonRecord, RouteSession } from "../../../src/index.js"
import type { SharedContinuityCapsule } from "./types.js"
import type { ProducedArtifact } from "./types.js"

export interface AdapterExecutionContext {
  session: RouteSession
  continuity: SharedContinuityCapsule
}

export interface AdapterExecutionResult {
  status: "succeeded" | "failed"
  output: JsonRecord
  evidence: string[]
  artifacts: ProducedArtifact[]
  error?: string
}

/** Implementations must be idempotent for a repeated ExecutionRequest.id. */
export interface ExecutionAdapter {
  id: string
  capabilities: readonly string[]
  execute(request: ExecutionRequest, context: AdapterExecutionContext): Promise<AdapterExecutionResult>
}

export class ExecutionAdapterRegistry {
  private readonly adapters = new Map<string, ExecutionAdapter>()

  register(adapter: ExecutionAdapter): void {
    for (const capability of adapter.capabilities) {
      if (this.adapters.has(capability)) throw new Error(`Execution capability already registered: ${capability}`)
      this.adapters.set(capability, adapter)
    }
  }

  resolve(capability: string): ExecutionAdapter | undefined {
    return this.adapters.get(capability)
  }
}

/** Safe local adapter used by tests and the demo. It performs no external action. */
export class EchoExecutionAdapter implements ExecutionAdapter {
  readonly id = "local.echo"

  constructor(readonly capabilities: readonly string[]) {}

  async execute(request: ExecutionRequest): Promise<AdapterExecutionResult> {
    return {
      status: "succeeded",
      output: { acceptedPayload: request.payload, adapter: this.id },
      evidence: [`execution:${request.id}:echoed`],
      artifacts: [{ ref: `local://echo/${request.id}`, kind: "execution-receipt", title: "Local execution receipt" }],
    }
  }
}
