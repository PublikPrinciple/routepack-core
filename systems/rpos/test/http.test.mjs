import assert from "node:assert/strict"
import test from "node:test"
import {
  EchoExecutionAdapter,
  ExecutionAdapterRegistry,
  InMemoryRposStore,
  RposService,
  createRposHttpServer,
  designProductionBlueprint,
  designProductionCapabilities,
} from "../dist/systems/rpos/src/index.js"

test("the HTTP boundary is authenticated and accepts a Murmur interaction", async (context) => {
  let sequence = 0
  const runtime = { now: () => "2026-09-20T12:00:00.000Z", nextId: (prefix) => `${prefix}-${++sequence}` }
  const adapters = new ExecutionAdapterRegistry()
  adapters.register(new EchoExecutionAdapter(designProductionCapabilities()))
  const service = new RposService(new InMemoryRposStore(), adapters, runtime)
  await service.installBlueprint(designProductionBlueprint())
  const server = createRposHttpServer(service, "test-key")
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
  const address = server.address()
  assert.notEqual(address, null)
  assert.equal(typeof address, "object")
  const base = `http://127.0.0.1:${address.port}`

  assert.equal((await fetch(`${base}/health`)).status, 200)
  assert.equal((await fetch(`${base}/v1/audit`)).status, 401)
  assert.equal((await fetch(`${base}/v1/interactions`, {
    method: "POST",
    headers: { authorization: "Bearer test-key", "content-type": "application/json" },
    body: JSON.stringify({ message: "Create an editorial image." }),
  })).status, 400)
  const response = await fetch(`${base}/v1/interactions`, {
    method: "POST",
    headers: { authorization: "Bearer test-key", "content-type": "application/json" },
    body: JSON.stringify({ actor: "murmur.user", message: "Create an editorial image." }),
  })
  assert.equal(response.status, 201)
  const result = await response.json()
  assert.equal(result.interpretation.status, "interpreted")
  assert.equal(result.resolution.status, "started")
})
