# RoutePack Core

`RoutePack Core` is a small, portable TypeScript kernel for the RoutePack Operating System (RPOS).

It is the extractable core behind a governed transition:

```text
Human request
  -> RoutePack Interaction Layer
  -> RPOS route resolution and gate checks
  -> bounded execution adapter
  -> evidence, artifacts, approvals, and continuity
```

It intentionally does **not** include a chat interface, model provider, database, UI framework, agent runtime, or direct tool access. Those belong to adapters built around this core.

The separately runnable operating system now lives in `systems/rpos`. It adds RouteGraphs, RouteStacks, shared continuity, execution adapters, persistence, organizational analysis, an authenticated Murmur-facing API, and the complete 15-stage design-production route while keeping this kernel provider-neutral.

## What is included

- Domain-neutral `RoutePack` contracts: entry conditions, actions, constraints, resources, outputs, verification, exceptions, telemetry, and learning.
- A validated `RouteRegistry` for reusable RoutePack releases.
- Content-addressed releases, so a running route refers to the exact route contract it was opened with.
- `RouteSession` authorization that permits only declared capabilities and respects evidence, policy, authority, quality, and system gates.
- Delta-based `ContinuityCapsule` state that outlives a chat or a particular model.
- Artifact obligations derived from a completed transition contract.
- A runnable editorial-image example and Node test suite.

## Quick start

```bash
npm install
npm run test:all
npm run build
npm run demo:rpos
```

The example shows a design RoutePack that requires source grounding before image generation and a human authority gate before completion.

## Core boundaries

| Layer | Owns | Does not own |
| --- | --- | --- |
| Murmur or another client | Conversational interaction and visibility | Operational truth or authorization |
| RoutePack Interaction Layer | Natural-language translation and presentation | Tool execution |
| RoutePack Core / RPOS | Contract resolution, session bounds, gates, continuity, artifact obligations | Models, tools, databases, UI |
| Execution adapters | Provider-specific tool or model calls | Permission to exceed the RoutePack |

The core only authorizes a proposed execution. An adapter executes it and returns an evidence-bearing result that the host application records in the Continuity Capsule.

## Repository structure

```text
src/contracts.ts    Portable RoutePack, session, gate, continuity, and artifact types
src/validation.ts   Structural contract validation
src/release.ts      Deterministic release sealing
src/registry.ts     Reusable RoutePack inventory
src/session.ts      Bounded operation authorization and completion checks
src/continuity.ts   Immutable, delta-based route memory
src/engine.ts       Route resolution -> sealed session -> continuity -> artifacts
examples/           A complete editorial-image RoutePack
test/               Contract and behavior tests
systems/rpos/       Separate RPOS runtime, API, persistence, audit, and tests
```

## Status and next steps

The kernel is complete as the portable contract layer. `systems/rpos` is a working local control plane with file persistence and a hash-linked audit record. Production use still requires an institutional identity/authority provider, hardened secrets management, production-grade storage, and real execution adapters.

## Provenance and license

This repository extracts and generalizes load-bearing RoutePack ideas from the CivikAccess codebase while leaving that source checkout unchanged. It is distributed under `AGPL-3.0-only`, matching its source project declaration.
