import assert from "node:assert/strict"
import test from "node:test"
import {
  applyContinuityDelta,
  completeRouteSession,
  createContinuityCapsule,
  openRouteRun,
  requestExecution,
  resolveGate,
  RouteRegistry,
  sealRoutePack,
  startRouteSession,
  validateRoutePack,
} from "../dist/src/index.js"

const makePack = () => ({
  identity: { id: "design.image", version: "1.0.0", domain: "design", kind: "generation", owner: "CivikStack" },
  purpose: { intent: "create", expectedOutcome: "Approved image", supportedIntents: ["create"] },
  entry: { requiredInputKeys: ["brief"] },
  transformation: {
    topology: "sequence",
    actions: [{ id: "generate", summary: "Generate image", capability: "image.generate", requiredGateIds: ["source"] }],
  },
  constraints: {
    invariants: ["Source is preserved"],
    prohibitedStates: ["released-without-approval"],
    requiredGates: [
      { id: "source", kind: "evidence", phase: "start", description: "Source reviewed" },
      { id: "approval", kind: "authority", phase: "completion", description: "Human approved" },
    ],
  },
  resources: { roles: ["designer"], systems: ["image-generator"], knowledge: ["brand"], permittedCapabilities: ["image.generate"] },
  outputs: {
    resultingState: "approved",
    artifacts: [{ id: "image", kind: "image", title: "Hero image", requiredFor: "completion", acceptanceCriteria: ["reviewed"] }],
    eventTypes: ["artifact.created"],
    downstreamRouteKinds: ["release"],
  },
  verification: { evidenceRequirements: ["brief"], acceptanceCriteria: ["reviewed"] },
  exceptions: { escalation: "Ask lead", recovery: "Revise", rollback: "Restore prior" },
  telemetry: { measures: ["cycle"], timing: ["duration"], failureSignals: ["qa-failure"] },
  learning: { reviewTrigger: "failure", updateAuthority: "lead" },
})

const request = () => ({
  id: "req-1",
  intent: "create",
  object: "visual_asset",
  domain: "design",
  sourceContextRequired: true,
  requestedCapabilities: ["image.generate"],
  input: { brief: "Make an image" },
})

test("validation rejects a RoutePack with an unknown action gate", () => {
  const pack = makePack()
  pack.transformation.actions[0].requiredGateIds = ["not-defined"]
  const result = validateRoutePack(pack)
  assert.equal(result.valid, false)
  assert.match(result.issues[0].message, /unknown gate/)
})

test("a sealed release is immutable and content-addressed", async () => {
  const pack = makePack()
  const first = await sealRoutePack(pack, "2026-09-20T10:00:00.000Z")
  const second = await sealRoutePack(pack, "2026-09-20T11:00:00.000Z")
  assert.equal(first.contentHash, second.contentHash)
  pack.purpose.expectedOutcome = "Changed after release"
  assert.equal(first.snapshot.purpose.expectedOutcome, "Approved image")
})

test("the continuity capsule records deltas without mutating its base state", async () => {
  const release = await sealRoutePack(makePack(), "2026-09-20T10:00:00.000Z")
  const capsule = createContinuityCapsule({ id: "cap-1", routeSessionId: "session-1", release, baseState: { intent: { name: "image" } } })
  const updated = applyContinuityDelta(capsule, {
    id: "delta-1",
    kind: "decision",
    at: "2026-09-20T10:01:00.000Z",
    actor: "lead",
    rationale: "Keep the established visual direction.",
    patch: { intent: { direction: "observational editorial" } },
  })
  assert.deepEqual(capsule.baseState, { intent: { name: "image" } })
  assert.deepEqual(updated.currentState, { intent: { name: "image", direction: "observational editorial" } })
  assert.equal(updated.deltas.length, 1)
})

test("sessions deny disallowed capabilities and wait for start gates", async () => {
  const release = await sealRoutePack(makePack(), "2026-09-20T10:00:00.000Z")
  const start = startRouteSession({ id: "session-1", release, request: request(), initialState: "requested", startedAt: "2026-09-20T10:00:00.000Z" })
  assert.equal(start.session.status, "awaiting-gates")
  const waiting = requestExecution(start.session, { id: "exec-1", capability: "image.generate", actionId: "generate", payload: {} }, "2026-09-20T10:00:01.000Z")
  assert.equal(waiting.executions.at(-1).disposition, "awaiting-gates")
  const active = resolveGate({ session: waiting, gateId: "source", status: "accepted", actor: "researcher", at: "2026-09-20T10:01:00.000Z" })
  const denied = requestExecution(active, { id: "exec-2", capability: "email.send", payload: {} }, "2026-09-20T10:02:00.000Z")
  assert.equal(denied.executions.at(-1).disposition, "denied")
})

test("completion requires the human authority gate", async () => {
  const release = await sealRoutePack(makePack(), "2026-09-20T10:00:00.000Z")
  const start = startRouteSession({ id: "session-1", release, request: request(), initialState: "requested", startedAt: "2026-09-20T10:00:00.000Z" })
  const active = resolveGate({ session: start.session, gateId: "source", status: "accepted", actor: "researcher", at: "2026-09-20T10:01:00.000Z" })
  assert.throws(() => completeRouteSession(active, "approved", "2026-09-20T10:02:00.000Z"), /open completion gates/)
  const approved = resolveGate({ session: active, gateId: "approval", status: "accepted", actor: "design-lead", at: "2026-09-20T10:03:00.000Z" })
  assert.equal(completeRouteSession(approved, "approved", "2026-09-20T10:04:00.000Z").status, "completed")
})

test("a rejected gate blocks the session", async () => {
  const release = await sealRoutePack(makePack(), "2026-09-20T10:00:00.000Z")
  const start = startRouteSession({ id: "session-1", release, request: request(), initialState: "requested", startedAt: "2026-09-20T10:00:00.000Z" })
  const rejected = resolveGate({ session: start.session, gateId: "source", status: "rejected", actor: "researcher", at: "2026-09-20T10:01:00.000Z" })
  assert.equal(rejected.status, "blocked")
  assert.throws(() => resolveGate({ session: rejected, gateId: "source", status: "accepted", actor: "researcher", at: "2026-09-20T10:02:00.000Z" }), /already rejected/)
})

test("the engine resolves a route, opens a bounded session, and derives artifact work", async () => {
  const registry = new RouteRegistry()
  const pack = makePack()
  registry.register(pack)
  const run = await openRouteRun({
    registry,
    routeId: pack.identity.id,
    request: request(),
    initialState: "requested",
    baseState: { objective: "Make an image" },
    sessionId: "session-1",
    capsuleId: "capsule-1",
    at: "2026-09-20T10:00:00.000Z",
  })
  assert.equal(run.session.status, "awaiting-gates")
  assert.equal(run.capsule.routeRelease.contentHash, run.session.release.contentHash)
  assert.equal(run.artifacts[0].spec.id, "image")
})
