import { timingSafeEqual } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { ExecutionRequest, GateStatus, RouteRequest } from "../../../src/index.js"
import type { RposService } from "./service.js"
import type { InteractionEnvelope, InteractionHints, OrganizationObservation } from "./types.js"

const BODY_LIMIT = 1_000_000

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload) })
  response.end(payload)
}

function authorized(request: IncomingMessage, apiKey: string): boolean {
  const header = request.headers.authorization
  if (!header?.startsWith("Bearer ")) return false
  const supplied = Buffer.from(header.slice(7))
  const expected = Buffer.from(apiKey)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > BODY_LIMIT) throw new Error("Request body exceeds 1 MB")
    chunks.push(bytes)
  }
  if (chunks.length === 0) return {}
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("JSON body must be an object")
  return parsed as Record<string, unknown>
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function requiredObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`)
  return value as Record<string, unknown>
}

export function createRposHttpServer(service: RposService, apiKey: string): Server {
  if (!apiKey) throw new Error("RPOS API key is required")
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://rpos.local")
      if (request.method === "GET" && url.pathname === "/health") return send(response, 200, { status: "ok", service: "rpos" })
      if (!authorized(request, apiKey)) return send(response, 401, { error: "unauthorized" })

      if (request.method === "POST" && url.pathname === "/v1/interactions") {
        const value = await body(request)
        const result = await service.submitInteraction({
          ...(typeof value.id === "string" ? { id: value.id } : {}),
          actor: requiredText(value.actor, "actor"),
          message: requiredText(value.message, "message"),
          ...(typeof value.hints === "object" && value.hints !== null && !Array.isArray(value.hints) ? { hints: value.hints as InteractionHints } : {}),
        }, typeof value.preferredGraphKey === "string" ? value.preferredGraphKey : undefined)
        return send(response, result.resolution?.status === "started" ? 201 : 200, result)
      }
      if (request.method === "POST" && url.pathname === "/v1/requests") {
        const value = await body(request)
        const structured = requiredObject(value.request, "request") as unknown as RouteRequest
        requiredText(structured.id, "request.id")
        requiredText(structured.intent, "request.intent")
        requiredText(structured.object, "request.object")
        requiredText(structured.domain, "request.domain")
        const result = await service.submitRequest(structured, requiredText(value.actor, "actor"), typeof value.preferredGraphKey === "string" ? value.preferredGraphKey : undefined)
        return send(response, result.status === "started" ? 201 : 200, result)
      }
      const runMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)$/)
      if (request.method === "GET" && runMatch?.[1]) return send(response, 200, await service.getRunView(decodeURIComponent(runMatch[1])))

      const startMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/nodes\/([^/]+)\/start$/)
      if (request.method === "POST" && startMatch?.[1] && startMatch[2]) {
        const value = await body(request)
        return send(response, 201, await service.startNode(decodeURIComponent(startMatch[1]), decodeURIComponent(startMatch[2]), requiredText(value.actor, "actor")))
      }
      const gateMatch = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/gates\/([^/]+)$/)
      if (request.method === "POST" && gateMatch?.[1] && gateMatch[2]) {
        const value = await body(request)
        if (!(["accepted", "rejected", "waived"] as unknown[]).includes(value.status)) throw new Error("status must be accepted, rejected, or waived")
        return send(response, 200, await service.resolveSessionGate({
          sessionId: decodeURIComponent(gateMatch[1]),
          gateId: decodeURIComponent(gateMatch[2]),
          status: value.status as Exclude<GateStatus, "open">,
          actor: requiredText(value.actor, "actor"),
          ...(typeof value.note === "string" ? { note: value.note } : {}),
        }))
      }
      const executionMatch = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/executions$/)
      if (request.method === "POST" && executionMatch?.[1]) {
        const value = await body(request)
        const execution = requiredObject(value.request, "request") as unknown as ExecutionRequest
        requiredText(execution.id, "request.id")
        requiredText(execution.capability, "request.capability")
        return send(response, 200, await service.dispatchExecution(decodeURIComponent(executionMatch[1]), execution, requiredText(value.actor, "actor")))
      }
      const completeMatch = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/complete$/)
      if (request.method === "POST" && completeMatch?.[1]) {
        const value = await body(request)
        return send(response, 200, await service.completeNode(decodeURIComponent(completeMatch[1]), requiredText(value.resultingState, "resultingState"), requiredText(value.actor, "actor")))
      }
      if (request.method === "POST" && url.pathname === "/v1/organizations/analyze") {
        const value = await body(request)
        return send(response, 201, await service.analyzeOrganization(requiredObject(value.observation, "observation") as unknown as OrganizationObservation, requiredText(value.actor, "actor")))
      }
      if (request.method === "GET" && url.pathname === "/v1/audit") {
        const snapshot = await service.snapshot()
        return send(response, 200, { events: snapshot.audit })
      }
      return send(response, 404, { error: "not_found" })
    } catch (error) {
      return send(response, 400, { error: error instanceof Error ? error.message : "request_failed" })
    }
  })
}
