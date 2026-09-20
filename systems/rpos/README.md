# RPOS

RPOS is the separately runnable RoutePack Operating System built on `RoutePack Core`.

The full conceptual contract is recorded in `OPERATING-MODEL.md`.

```text
Murmur or another client
  -> RoutePack Interaction Layer
  -> RouteGraph resolution
  -> bounded Route Sessions
  -> execution adapters
  -> continuity + artifacts + audit
```

## What runs today

- A rule-bounded interaction layer turns a plain-language request into a structured `RouteRequest`. If intent, object, or domain is unclear, it returns `needs-clarification`.
- Version-pinned RouteGraphs compose RoutePacks and unlock work only when dependencies complete.
- RouteStacks group approved graphs for a domain.
- RPOS opens a bounded Route Session per graph node and enforces every RoutePack capability and gate.
- One shared Continuity Capsule keeps protected intent and execution state coherent across all nodes.
- Execution adapters are explicit and must be idempotent. The bundled echo adapter proves the route without contacting an external model or tool.
- Adapter outputs become registered artifacts tied to the exact RoutePack release, graph run, session, and execution outcome that produced them.
- JSON-file persistence uses atomic replacement; an in-memory adapter supports tests.
- Every significant change enters a SHA-256 hash-linked audit chain.
- Organization analysis uses the seven universal families—Govern, Sense, Plan, Operate, Deliver, Generate, Learn—and labels machine classification `proposed` or `unknown`.
- The included design-production blueprint implements the complete 15-stage loop from Demand through Learning.

## Run it

From the repository root:

```bash
npm install
npm run test:all
npm run demo:rpos
```

Start the local HTTP service with an explicit credential:

```bash
RPOS_API_KEY='replace-with-a-local-secret' npm run start:rpos
```

It binds to `127.0.0.1:4317` by default and writes runtime state to `systems/rpos/data/rpos-state.json`. Set `RPOS_HOST`, `RPOS_PORT`, or `RPOS_DATA_FILE` to override those values.

The server starts with **no execution adapters**. This prevents an unconfigured system from claiming work happened. Register real adapters in the composition root. For local demonstrations only, `RPOS_ENABLE_DEMO_ADAPTERS=true` enables inert adapters that produce local receipts; the server refuses that flag when `NODE_ENV=production`.

## Murmur-facing API

- `POST /v1/interactions` — interpret a conversational request and resolve its RouteGraph.
- `POST /v1/requests` — submit an already structured RouteRequest.
- `GET /v1/runs/:runId` — read active route, nodes, artifacts, continuity, and outstanding gates.
- `POST /v1/runs/:runId/nodes/:nodeId/start` — open the next bounded Route Session.
- `POST /v1/sessions/:sessionId/gates/:gateId` — record an attributed gate decision.
- `POST /v1/sessions/:sessionId/executions` — authorize and dispatch through a registered adapter.
- `POST /v1/sessions/:sessionId/complete` — close a node and unlock its dependents.
- `POST /v1/organizations/analyze` — create a proposed seven-family organizational analysis.
- `GET /v1/audit` — read the hash-linked operational record.

`GET /health` is the only unauthenticated route.

## Boundaries

RPOS routes and governs work. It does not decide institutional policy, invent approval authority, or treat an inferred organization model as confirmed truth. The example execution adapter is deliberately inert. Real image, video, audio, agent, email, deployment, and data adapters must be registered explicitly and remain constrained by their active Route Session.
