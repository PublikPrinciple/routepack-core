import type { RouteSession } from "../../../src/index.js"
import type { RouteGraphDefinition, RouteGraphRun } from "./types.js"

export interface GraphValidationResult {
  valid: boolean
  issues: string[]
}

export function validateRouteGraph(graph: RouteGraphDefinition, availableRoutePackReleases: ReadonlySet<string>): GraphValidationResult {
  const issues: string[] = []
  if (!graph.id.trim()) issues.push("id must be present")
  if (!graph.version.trim()) issues.push("version must be present")
  if (!graph.name.trim()) issues.push("name must be present")
  if (!graph.domain.trim()) issues.push("domain must be present")
  if (graph.supportedIntents.length === 0) issues.push("supportedIntents must not be empty")
  if (graph.objectKinds.length === 0) issues.push("objectKinds must not be empty")
  if (graph.nodes.length === 0) issues.push("nodes must not be empty")

  const nodeIds = new Set<string>()
  for (const node of graph.nodes) {
    if (!node.id.trim()) issues.push("every node id must be present")
    if (nodeIds.has(node.id)) issues.push(`duplicate node id: ${node.id}`)
    nodeIds.add(node.id)
    if (!availableRoutePackReleases.has(`${node.routePackId}@${node.routePackVersion}`)) {
      issues.push(`unknown RoutePack release: ${node.routePackId}@${node.routePackVersion}`)
    }
  }

  for (const node of graph.nodes) {
    for (const dependency of node.dependsOn) {
      if (!nodeIds.has(dependency)) issues.push(`node ${node.id} depends on unknown node ${dependency}`)
      if (dependency === node.id) issues.push(`node ${node.id} cannot depend on itself`)
    }
  }

  if (!hasAcyclicOrder(graph)) issues.push("graph contains a cycle; the v0.1 runtime requires explicit acyclic execution")
  if (graph.nodes.length > 0 && !graph.nodes.some((node) => node.dependsOn.length === 0)) issues.push("graph must have at least one entry node")
  return { valid: issues.length === 0, issues }
}

function hasAcyclicOrder(graph: RouteGraphDefinition): boolean {
  const remaining = new Map(graph.nodes.map((node) => [node.id, new Set(node.dependsOn)]))
  const ready = [...remaining.entries()].filter(([, dependencies]) => dependencies.size === 0).map(([id]) => id)
  let visited = 0
  while (ready.length > 0) {
    const id = ready.shift()
    if (!id || !remaining.has(id)) continue
    remaining.delete(id)
    visited += 1
    for (const [otherId, dependencies] of remaining) {
      dependencies.delete(id)
      if (dependencies.size === 0 && !ready.includes(otherId)) ready.push(otherId)
    }
  }
  return visited === graph.nodes.length
}

export function createGraphRun(input: {
  id: string
  graph: RouteGraphDefinition
  request: RouteGraphRun["request"]
  sharedCapsuleId: string
  at: string
}): RouteGraphRun {
  return {
    id: input.id,
    graphId: input.graph.id,
    graphVersion: input.graph.version,
    request: input.request,
    status: "active",
    nodes: input.graph.nodes.map((node) => ({ nodeId: node.id, status: node.dependsOn.length === 0 ? "ready" : "pending" })),
    sharedCapsuleId: input.sharedCapsuleId,
    startedAt: input.at,
  }
}

export function attachNodeSession(run: RouteGraphRun, nodeId: string, session: RouteSession): RouteGraphRun {
  const node = run.nodes.find((candidate) => candidate.nodeId === nodeId)
  if (!node) throw new Error(`Unknown graph node: ${nodeId}`)
  if (node.status !== "ready") throw new Error(`Graph node ${nodeId} is ${node.status}, not ready`)
  const status = session.status === "awaiting-gates" ? "awaiting-gates" : session.status === "blocked" ? "blocked" : "active"
  return refreshGraphRun({
    ...run,
    nodes: run.nodes.map((candidate) => candidate.nodeId === nodeId ? { ...candidate, status, routeSessionId: session.id } : candidate),
  }, undefined)
}

export function syncNodeSession(run: RouteGraphRun, session: RouteSession): RouteGraphRun {
  const status = session.status === "completed"
    ? "completed"
    : session.status === "awaiting-gates"
      ? "awaiting-gates"
      : session.status === "blocked" || session.status === "cancelled"
        ? "blocked"
        : "active"
  return refreshGraphRun({
    ...run,
    nodes: run.nodes.map((node) => node.routeSessionId === session.id ? { ...node, status } : node),
  }, session.completedAt)
}

function refreshGraphRun(run: RouteGraphRun, completedAt: string | undefined): RouteGraphRun {
  const graphCompleted = run.nodes.every((node) => node.status === "completed")
  const graphBlocked = run.nodes.some((node) => node.status === "blocked")
  const graphAwaiting = run.nodes.some((node) => node.status === "awaiting-gates")
  return {
    ...run,
    status: graphCompleted ? "completed" : graphBlocked ? "blocked" : graphAwaiting ? "awaiting-gates" : "active",
    ...(graphCompleted && completedAt ? { completedAt } : {}),
  }
}

export function unlockReadyNodes(run: RouteGraphRun, graph: RouteGraphDefinition): RouteGraphRun {
  const completed = new Set(run.nodes.filter((node) => node.status === "completed").map((node) => node.nodeId))
  const nodes = run.nodes.map((state) => {
    if (state.status !== "pending") return state
    const definition = graph.nodes.find((node) => node.id === state.nodeId)
    if (!definition) return { ...state, status: "blocked" as const }
    return definition.dependsOn.every((dependency) => completed.has(dependency)) ? { ...state, status: "ready" as const } : state
  })
  return { ...run, nodes }
}
