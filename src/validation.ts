import type { RoutePack, ValidationIssue, ValidationResult } from "./contracts.js"

const required = (value: string | undefined, path: string, issues: ValidationIssue[]) => {
  if (!value?.trim()) issues.push({ path, message: "must be a non-empty string" })
}

/** Structural validation only. Domain policy belongs in the caller's adapters. */
export function validateRoutePack(pack: RoutePack): ValidationResult {
  const issues: ValidationIssue[] = []

  required(pack.identity.id, "identity.id", issues)
  required(pack.identity.version, "identity.version", issues)
  required(pack.identity.domain, "identity.domain", issues)
  required(pack.identity.kind, "identity.kind", issues)
  required(pack.identity.owner, "identity.owner", issues)
  required(pack.purpose.intent, "purpose.intent", issues)
  required(pack.purpose.expectedOutcome, "purpose.expectedOutcome", issues)
  required(pack.outputs.resultingState, "outputs.resultingState", issues)
  required(pack.exceptions.escalation, "exceptions.escalation", issues)
  required(pack.exceptions.recovery, "exceptions.recovery", issues)
  required(pack.exceptions.rollback, "exceptions.rollback", issues)
  required(pack.learning.reviewTrigger, "learning.reviewTrigger", issues)
  required(pack.learning.updateAuthority, "learning.updateAuthority", issues)

  if (pack.purpose.supportedIntents.length === 0) {
    issues.push({ path: "purpose.supportedIntents", message: "must name at least one supported intent" })
  }
  if (pack.transformation.actions.length === 0) {
    issues.push({ path: "transformation.actions", message: "must contain at least one action" })
  }

  const actionIds = new Set<string>()
  for (const [index, action] of pack.transformation.actions.entries()) {
    const base = `transformation.actions[${index}]`
    required(action.id, `${base}.id`, issues)
    required(action.summary, `${base}.summary`, issues)
    required(action.capability, `${base}.capability`, issues)
    if (actionIds.has(action.id)) issues.push({ path: `${base}.id`, message: "must be unique" })
    actionIds.add(action.id)
  }

  const gateIds = new Set<string>()
  for (const [index, gate] of pack.constraints.requiredGates.entries()) {
    const base = `constraints.requiredGates[${index}]`
    required(gate.id, `${base}.id`, issues)
    required(gate.description, `${base}.description`, issues)
    if (gateIds.has(gate.id)) issues.push({ path: `${base}.id`, message: "must be unique" })
    gateIds.add(gate.id)
  }

  for (const [index, action] of pack.transformation.actions.entries()) {
    for (const gateId of action.requiredGateIds ?? []) {
      if (!gateIds.has(gateId)) {
        issues.push({ path: `transformation.actions[${index}].requiredGateIds`, message: `references unknown gate ${gateId}` })
      }
    }
  }

  return { valid: issues.length === 0, issues }
}

export function assertValidRoutePack(pack: RoutePack): void {
  const result = validateRoutePack(pack)
  if (!result.valid) {
    const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")
    throw new Error(`Invalid RoutePack: ${detail}`)
  }
}
