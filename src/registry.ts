import type { RoutePack, RouteRequest } from "./contracts.js"
import { assertValidRoutePack } from "./validation.js"

export class RouteRegistry {
  private readonly packs = new Map<string, RoutePack>()

  register(pack: RoutePack): void {
    assertValidRoutePack(pack)
    const key = `${pack.identity.id}@${pack.identity.version}`
    if (this.packs.has(key)) throw new Error(`RoutePack release already registered: ${key}`)
    this.packs.set(key, pack)
  }

  list(): RoutePack[] {
    return [...this.packs.values()]
  }

  resolve(request: Pick<RouteRequest, "domain" | "intent">): RoutePack[] {
    return this.list().filter(
      (pack) => pack.identity.domain === request.domain && pack.purpose.supportedIntents.includes(request.intent),
    )
  }
}
