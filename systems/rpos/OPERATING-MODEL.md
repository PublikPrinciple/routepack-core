# RPOS operating model

This document is the canonical conceptual specification for the RoutePack Operating System implemented in this directory. Code is the authority for what is currently built; this document explains the intended system shape.

## Primitive

A RoutePack is an executable contract for moving an entity from one valid state to another under constraints, with evidence proving the transition.

```text
State A
  -> entry conditions
  -> permitted transformation
  -> invariants and gates
  -> verification evidence
State B
```

It is not primarily a task list, artifact, conversation, or workflow ticket. In the DNA analogy, a RoutePack is the governed sequence; the execution environment expresses it, while versions and evidence prevent accidental drift.

## Stable hierarchy

```text
RouteDomain
  -> RouteEngine
  -> RouteStack
  -> RouteGraph
  -> RoutePack
  -> RouteSession
```

- **RouteDomain** bounds the thing being modeled.
- **RouteEngine / RPOS** resolves, governs, and advances work.
- **RouteStack** groups the graph capabilities required by a domain.
- **RouteGraph** composes version-pinned RoutePacks into sequence, branch, join, parallel, gate, event-driven, network, or adaptive structures.
- **RoutePack** governs one controlled transition.
- **RouteSession** is the temporary, bounded execution environment for one RoutePack release.

The v0.1 executor implements explicit acyclic dependencies. Cyclic, network, and adaptive execution require a future event and stopping-policy contract; RPOS refuses to infer one.

## Four-layer interaction architecture

```text
Human
  -> Murmur
  -> RoutePack Interaction Layer
  -> RPOS
  -> execution adapters
```

- **Murmur** is the conversational control surface.
- **The RoutePack Interaction Layer** translates human intent into a structured RouteRequest and presents system state.
- **RPOS** resolves the graph, maintains continuity, enforces gates and capabilities, and records the result.
- **Execution adapters** connect approved requests to models, agents, tools, humans, and production systems.

Conversation history is not operational memory. The Continuity Capsule owns objective, source state, protected claims, decisions, artifacts, gates, route history, and execution outcomes.

## Three planes

```text
Control plane       Continuity plane       Execution plane
RouteGraphs         Intent                 Models
Invariants          Evidence               Agents
Authorities         Decisions              Tools
Gates               Provenance             Humans and systems
```

RPOS connects the planes without collapsing them. An executor may propose or perform an allowed action; it does not gain authority to change the route, waive a gate, or rewrite protected truth.

## Seven organizational families

Every observed organizational function can be assessed against the same seven families:

1. **Govern** — authority, policy, approvals, compliance, risk, and budgets.
2. **Sense** — research, discovery, monitoring, assessment, inspection, and investigation.
3. **Plan** — strategy, options, prioritization, design, procurement, and scheduling.
4. **Operate** — internal finance, people, technology, facilities, and administration.
5. **Deliver** — the external service, product, care, education, construction, or other value.
6. **Generate** — artifacts required by any other family: reports, software, images, video, notices, forms, or datasets.
7. **Learn** — evaluation, repair, postmortem, training, and controlled system revision.

Automated classification is always a proposal. Human-declared classifications are marked confirmed; insufficient or conflicting signals remain unknown.

## Reusable RoutePack archetypes

The initial universal vocabulary is Intake, Qualification, Transformation, Decision, Authorization, Transfer, Verification, Generation, Deployment, Observation, Recovery, and Learning. Domains supply the content; the transition grammar remains stable.

## Intergenerative behavior

A transition may create a new state, artifact, event, downstream obligation, escalation, or another RoutePack request. Generation is therefore a callable production service rather than a detached content department.

```text
State transition
  -> artifact obligation
  -> Generation RoutePack
  -> registered artifact
  -> QA / authorization / deployment routes
```

Ambiguous routing stops for selection. The engine does not silently choose between equally valid institutional routes.

## Design-production reference graph

The included `RG-DES-EDITORIAL-IMAGE@1.0.0` blueprint implements the complete loop defined in the design conversation:

```text
Demand
  -> Qualification
  -> Routing
  -> Material Pull
  -> Assembly
  -> Generation
  -> QA
  -> Polish
  -> Preflight
  -> Freeze
  -> Authorization
  -> Deployment
  -> Field Verification
  -> Observation
  -> Learning
```

Its invariant is:

```text
protected source intent = protected intent in the experienced output
```

The system generates inside a governed production envelope. It does not generate freely and attempt to impose conformance afterward.

## Gate semantics

- **Evidence gate** — required evidence is missing or unresolved.
- **Policy gate** — the proposed action exceeds a codified rule.
- **Authority gate** — a designated human decision is required.
- **Quality gate** — the output failed its conformance contract.
- **System gate** — the target environment or deterministic runtime check is not ready.

A rejected gate blocks its Route Session. A node cannot complete until every declared action has a successful execution outcome and every completion gate is resolved.

## Current implementation status

Built and tested:

- versioned RoutePack, RouteGraph, and RouteStack contracts;
- graph resolution with human selection on ambiguity;
- bounded Route Sessions and gate/capability enforcement;
- graph-level and session-level Continuity Capsules;
- adapter dispatch with persisted authorization before side effects;
- registered artifact provenance;
- atomic local JSON persistence;
- SHA-256 hash-linked audit history;
- seven-family proposed organizational analysis;
- authenticated local HTTP interface for Murmur;
- the 15-stage design-production blueprint.

Not claimed as production-ready:

- institutional identity and role authorization;
- transactional multi-node database persistence;
- hardened secrets and key management;
- real image, video, audio, agent, email, payment, or deployment adapters;
- automatic cyclic/adaptive graph execution;
- production observability, load, recovery, and security validation.
