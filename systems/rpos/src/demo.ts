import { EchoExecutionAdapter, ExecutionAdapterRegistry } from "./adapters.js"
import { createNodeRuntime } from "./runtime.js"
import { designProductionBlueprint, designProductionCapabilities } from "./seed.js"
import { RposService } from "./service.js"
import { InMemoryRposStore } from "./store.js"

const adapters = new ExecutionAdapterRegistry()
adapters.register(new EchoExecutionAdapter(designProductionCapabilities()))
const service = new RposService(new InMemoryRposStore(), adapters, createNodeRuntime())
await service.installBlueprint(designProductionBlueprint())

const submission = await service.submitInteraction({
  actor: "demo.user",
  message: "Create an editorial image for the Access Reliability Lab announcement.",
})
if (submission.resolution?.status !== "started") throw new Error("Demo request did not resolve")

const runId = submission.resolution.run.id
const session = await service.startNode(runId, "demand", "demo.user")
const dispatched = await service.dispatchExecution(session.id, {
  id: "demo-execution-demand",
  actionId: "demand",
  capability: "request.capture",
  payload: { message: "Create an editorial image for the Access Reliability Lab announcement." },
}, "demo.user")
await service.completeNode(session.id, "demand-complete", "demo.user")
const view = await service.getRunView(runId)

console.log(JSON.stringify({
  graph: `${view.graph.id}@${view.graph.version}`,
  runStatus: view.run.status,
  executionStatus: dispatched.outcome?.status,
  completed: view.nodes.filter((node) => node.status === "completed").map((node) => node.node.id),
  ready: view.nodes.filter((node) => node.status === "ready").map((node) => node.node.id),
  continuityDeltas: view.continuity.deltas.length,
}, null, 2))
