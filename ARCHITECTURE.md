# Architecture record

This is the durable, derived architecture read for `RoutePack Core`. Source code remains the authority for implementation facts.

## Purpose

Provide a portable RoutePack Operating System kernel that holds the system state which must survive a conversation, browser, model, or execution-provider change.

## Load-bearing extraction

The CivikAccess source establishes several durable patterns worth preserving:

1. **A route is structured truth.** It has a stable contract, ordered activity, constraints, evidence, and an outcome—not a chat transcript or a generic task list.
2. **Publication must be gated.** A route should not advance merely because a model proposed it; unresolved evidence and human authority are first-class blockers.
3. **Versions matter.** A running surface must refer to a bounded release, not a mutable editor row.
4. **Derived work should follow state.** A completed transition can create explicit artifact obligations instead of relying on a person to remember a follow-up.
5. **The core is pure.** Storage, user interfaces, model calls, and tool calls are integration concerns, not part of the domain contract.

## Deliberate generalization

The existing civic-service `RoutePack` has location, resident, agency, corridor, and service fields. Those are load-bearing for CivikAccess but not universal. This repository replaces them with a portable contract: `identity`, `entry`, `transformation`, `constraints`, `resources`, `outputs`, `verification`, `exceptions`, `telemetry`, and `learning`.

The newly added RPOS concepts—`RouteRequest`, sealed `RouteRelease`, `RouteSession`, `ContinuityCapsule`, and `ArtifactObligation`—are architecture from the RoutePacks-for-Consistency design. They are a local implementation of that design, not a claim that CivikAccess already implements the full RPOS/Murmur system.

## Dependency direction

```text
Contracts -> validation/release/continuity/registry -> session -> engine
Adapters and UI -> RoutePack Core
```

The core never imports an adapter. It authorizes proposed operations; adapters execute allowed operations and report results back through the host application's continuity/audit boundary.

## Explicit non-goals

- Deciding institutional outcomes, policy, or approval authority.
- Performing model, tool, email, payment, deployment, or database actions.
- Treating model/chat history as durable operational memory.
- Replacing CivikAccess or copying its civic-service product surface.

## Verification baseline

`npm test` proves contract validation, deterministic sealing, immutable continuity deltas, capability boundaries, gate-controlled completion, and route-to-artifact derivation.

## RPOS runtime delta — 2026-09-20

The kernel remains pure. The separately runnable `systems/rpos` layer now owns the side effects and orchestration that do not belong in core:

```text
Murmur / client
  -> bounded RoutePack Interaction Layer
  -> version-pinned RouteGraph
  -> graph-level Continuity Capsule
  -> RoutePack session per node
  -> gate + capability authorization
  -> explicit execution adapter
  -> persisted outcome + hash-linked audit
```

### New load-bearing boundaries

- **RoutePack is the governed transition.** It remains domain-neutral and provider-neutral.
- **RouteGraph is composition.** Every node pins an exact RoutePack version; ambiguous graph resolution stops for human selection.
- **RouteStack is domain capability.** It groups approved graph releases without changing their contracts.
- **RPOS is orchestration.** It advances dependency state, preserves shared continuity, invokes only registered adapters, and records evidence.
- **Murmur is a client.** It can interpret and present state through the API, but it cannot bypass RPOS gates or make conversation history authoritative.
- **Organizational analysis is R3 inference.** Undeclared classifications remain `proposed`; unresolved functions remain `unknown`.

### Persistence and authority

The local JSON store is an adapter, not the domain model. It writes through atomic replacement and can be swapped for a transactional database without changing core contracts. The HTTP surface requires an explicit bearer credential and binds locally by default. That is suitable for local development, not a claim of production authentication or authorization.

### Runtime limitation carried explicitly

The v0.1 graph executor requires an acyclic dependency graph. `loop`, `network`, and `adaptive` remain valid descriptive topology labels, but cyclic execution requires an explicit event/iteration policy before RPOS may execute it. The validator refuses an implicit cycle rather than guessing its stopping rule.
