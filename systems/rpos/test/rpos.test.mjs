import assert from "node:assert/strict"
import test from "node:test"
import { join } from "node:path"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import {
  EchoExecutionAdapter,
  ExecutionAdapterRegistry,
  InMemoryRposStore,
  JsonFileRposStore,
  RposService,
  designProductionBlueprint,
  designProductionCapabilities,
  emptyRposState,
  verifyAuditChain,
} from "../dist/systems/rpos/src/index.js"

function deterministicRuntime() {
  let sequence = 0
  return {
    now: () => "2026-09-20T12:00:00.000Z",
    nextId: (prefix) => `${prefix}-${++sequence}`,
  }
}

async function seededService() {
  const adapters = new ExecutionAdapterRegistry()
  adapters.register(new EchoExecutionAdapter(designProductionCapabilities()))
  const service = new RposService(new InMemoryRposStore(), adapters, deterministicRuntime())
  await service.installBlueprint(designProductionBlueprint(), "test.bootstrap")
  return service
}

test("the design blueprint preserves the full 15-stage production loop", () => {
  const blueprint = designProductionBlueprint()
  assert.equal(blueprint.routePacks.length, 15)
  assert.deepEqual(
    blueprint.routeGraphs[0].nodes.map((node) => node.id),
    ["demand", "qualification", "routing", "material-pull", "assembly", "generation", "qa", "polish", "preflight", "freeze", "authorization", "deployment", "field-verification", "observation", "learning"],
  )
  assert.equal(blueprint.routeStacks[0].status, "approved")
})

test("RPOS interprets intent, starts a graph, enforces capabilities, and advances one node", async () => {
  const service = await seededService()
  const submission = await service.submitInteraction({ actor: "user-1", message: "Create an editorial image for the lab announcement." })
  assert.equal(submission.interpretation.status, "interpreted")
  assert.equal(submission.resolution.status, "started")
  const runId = submission.resolution.run.id
  const initial = await service.getRunView(runId)
  assert.deepEqual(initial.nodes.filter((node) => node.status === "ready").map((node) => node.node.id), ["demand"])

  const session = await service.startNode(runId, "demand", "user-1")
  const denied = await service.dispatchExecution(session.id, { id: "exec-denied", capability: "email.send", payload: {} }, "user-1")
  assert.equal(denied.session.executions.at(-1).disposition, "denied")
  assert.equal(denied.outcome, undefined)

  const accepted = await service.dispatchExecution(session.id, { id: "exec-demand", actionId: "demand", capability: "request.capture", payload: { message: "Create image" } }, "user-1")
  assert.equal(accepted.outcome.status, "succeeded")
  await service.completeNode(session.id, "demand-complete", "user-1")

  const advanced = await service.getRunView(runId)
  assert.deepEqual(advanced.nodes.filter((node) => node.status === "completed").map((node) => node.node.id), ["demand"])
  assert.deepEqual(advanced.nodes.filter((node) => node.status === "ready").map((node) => node.node.id), ["qualification"])
  assert.equal(advanced.nodes[0].artifacts[0].ref, "local://echo/exec-demand")
  assert.equal(advanced.nodes[0].artifacts[0].routeReleaseHash, session.release.contentHash)
  assert.ok(advanced.continuity.deltas.length >= 3)
  assert.equal(await verifyAuditChain((await service.snapshot()).audit), true)
})

test("start gates hold execution until evidence is accepted", async () => {
  const service = await seededService()
  const submission = await service.submitInteraction({ actor: "user-1", message: "Create an editorial image." })
  const runId = submission.resolution.run.id
  const demand = await service.startNode(runId, "demand", "user-1")
  await service.dispatchExecution(demand.id, { id: "exec-demand", actionId: "demand", capability: "request.capture", payload: {} }, "user-1")
  await service.completeNode(demand.id, "demand-complete", "user-1")
  const qualification = await service.startNode(runId, "qualification", "user-1")
  assert.equal(qualification.status, "awaiting-gates")
  const held = await service.dispatchExecution(qualification.id, { id: "exec-qualification", actionId: "qualification", capability: "source.verify", payload: {} }, "user-1")
  assert.equal(held.session.executions.at(-1).disposition, "awaiting-gates")
  const active = await service.resolveSessionGate({ sessionId: qualification.id, gateId: "source-evidence", status: "accepted", actor: "reviewer-1" })
  assert.equal(active.status, "active")
})

test("a node cannot complete before every declared action succeeds", async () => {
  const service = await seededService()
  const submission = await service.submitInteraction({ actor: "user-1", message: "Create an editorial image." })
  const session = await service.startNode(submission.resolution.run.id, "demand", "user-1")
  await assert.rejects(service.completeNode(session.id, "demand-complete", "user-1"), /successful execution is missing/)
})

test("ambiguous graph matches stop for human selection", async () => {
  const service = await seededService()
  const blueprint = designProductionBlueprint()
  const alternative = structuredClone(blueprint.routeGraphs[0])
  alternative.id = "RG-DES-EDITORIAL-IMAGE-ALT"
  alternative.name = "Alternative editorial image production"
  await service.installBlueprint({ routePacks: [], routeGraphs: [alternative], routeStacks: [] }, "test.bootstrap")
  const result = await service.submitInteraction({ actor: "user-1", message: "Create an editorial image." })
  assert.equal(result.resolution.status, "selection-required")
  assert.equal(result.resolution.candidateGraphKeys.length, 2)
})

test("organization analysis labels inference as proposed and preserves unknowns", async () => {
  const service = await seededService()
  const analysis = await service.analyzeOrganization({
    id: "org-1",
    name: "Example Institution",
    sector: "public service",
    observedAt: "2026-09-20T12:00:00.000Z",
    sourceRefs: ["interview-1"],
    functions: [
      { id: "f1", name: "Policy and approvals", description: "Approve policy and manage compliance", evidenceRefs: ["interview-1"] },
      { id: "f2", name: "Public reports", description: "Generate reports and documents", evidenceRefs: ["interview-1"] },
      { id: "f3", name: "Special team", description: "Handles miscellaneous work", evidenceRefs: ["interview-1"] },
    ],
  }, "analyst-1")
  assert.equal(analysis.status, "proposed")
  assert.equal(analysis.classifications.find((item) => item.functionId === "f1").family, "govern")
  assert.equal(analysis.classifications.find((item) => item.functionId === "f2").family, "generate")
  assert.deepEqual(analysis.unknownFunctionIds, ["f3"])
})

test("the JSON store persists and restores RPOS state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rpos-store-"))
  const file = join(directory, "state.json")
  const store = new JsonFileRposStore(file)
  const state = emptyRposState()
  state.organizations.push({ id: "org-1", name: "Example", sector: "test", observedAt: "2026-09-20T12:00:00.000Z", sourceRefs: [], functions: [] })
  await store.save(state)
  assert.equal((await new JsonFileRposStore(file).load()).organizations[0].id, "org-1")
})
