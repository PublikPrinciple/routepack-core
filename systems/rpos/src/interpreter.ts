import type { RouteRequest } from "../../../src/index.js"
import type { InteractionEnvelope, InteractionInterpretation } from "./types.js"

const INTENTS: Array<[string, readonly string[]]> = [
  ["create", ["create", "make", "generate", "produce", "build", "write"]],
  ["review", ["review", "inspect", "audit", "check"]],
  ["deploy", ["deploy", "publish", "release", "send"]],
  ["investigate", ["investigate", "research", "find", "analyze"]],
]

const OBJECTS: Array<[string, string, string, readonly string[]]> = [
  ["visual_asset", "design", "image.generate", ["image", "visual", "graphic", "poster", "banner"]],
  ["video", "video", "video.generate", ["video", "film", "animation"]],
  ["audio", "audio", "audio.generate", ["audio", "music", "sound", "narration", "voice"]],
  ["document", "editorial", "document.generate", ["document", "report", "brief", "article", "email"]],
  ["software", "software", "software.build", ["software", "application", "app", "code"]],
]

function firstMatch(message: string, entries: Array<[string, readonly string[]]>): string | undefined {
  return entries.find(([, signals]) => signals.some((signal) => message.includes(signal)))?.[0]
}

export class RuleBasedInteractionLayer {
  interpret(envelope: InteractionEnvelope, requestId: string): InteractionInterpretation {
    const message = envelope.message.trim()
    const normalized = message.toLowerCase()
    const intent = envelope.hints?.intent ?? firstMatch(normalized, INTENTS)
    const objectMatch = OBJECTS.find(([, , , signals]) => signals.some((signal) => normalized.includes(signal)))
    const object = envelope.hints?.object ?? objectMatch?.[0]
    const domain = envelope.hints?.domain ?? objectMatch?.[1]
    const requestedCapabilities = envelope.hints?.requestedCapabilities ?? (objectMatch ? [objectMatch[2]] : [])
    const unknowns = [!intent ? "intent" : null, !object ? "object" : null, !domain ? "domain" : null].filter((item): item is string => Boolean(item))
    const rationale = [
      ...(envelope.hints?.intent ? ["intent supplied by interaction hint"] : intent ? ["intent inferred from bounded verb vocabulary"] : []),
      ...(envelope.hints?.object ? ["object supplied by interaction hint"] : object ? ["object inferred from bounded artifact vocabulary"] : []),
      ...(envelope.hints?.domain ? ["domain supplied by interaction hint"] : domain ? ["domain inferred from object class"] : []),
    ]
    if (unknowns.length > 0 || !intent || !object || !domain) {
      return { status: "needs-clarification", confidence: Math.max(0, 1 - unknowns.length / 3), unknowns, rationale }
    }
    const request: RouteRequest = {
      id: requestId,
      intent,
      object,
      domain,
      sourceContextRequired: envelope.hints?.sourceContextRequired ?? intent === "create",
      requestedCapabilities,
      input: { message, actor: envelope.actor, ...(envelope.hints?.input ?? {}) },
    }
    const inferredCount = rationale.filter((line) => line.includes("inferred")).length
    return { status: "interpreted", confidence: Math.max(0.55, 1 - inferredCount * 0.12), unknowns: [], rationale, request }
  }
}
