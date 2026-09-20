import { fileURLToPath } from "node:url"
import { EchoExecutionAdapter, ExecutionAdapterRegistry } from "./adapters.js"
import { JsonFileRposStore } from "./file-store.js"
import { createRposHttpServer } from "./http.js"
import { createNodeRuntime } from "./runtime.js"
import { designProductionBlueprint, designProductionCapabilities } from "./seed.js"
import { RposService } from "./service.js"

const apiKey = process.env.RPOS_API_KEY
if (!apiKey) throw new Error("RPOS_API_KEY is required; the server will not start without an explicit local credential")

const dataFile = process.env.RPOS_DATA_FILE ?? fileURLToPath(new URL("../../../../data/rpos-state.json", import.meta.url))
const port = Number(process.env.RPOS_PORT ?? "4317")
const host = process.env.RPOS_HOST ?? "127.0.0.1"

const adapters = new ExecutionAdapterRegistry()
if (process.env.RPOS_ENABLE_DEMO_ADAPTERS === "true") {
  if (process.env.NODE_ENV === "production") throw new Error("Demo execution adapters are forbidden in production")
  adapters.register(new EchoExecutionAdapter(designProductionCapabilities()))
  console.warn("RPOS demo adapters are enabled; they record local receipts but perform no external work")
}
const service = new RposService(new JsonFileRposStore(dataFile), adapters, createNodeRuntime())
await service.installBlueprint(designProductionBlueprint())

const server = createRposHttpServer(service, apiKey)
server.listen(port, host, () => {
  console.log(`RPOS listening on http://${host}:${port}`)
  console.log(`State file: ${dataFile}`)
})
