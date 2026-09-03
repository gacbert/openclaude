import type { EffortValue } from './effort.js'

const ULTRA_SYSTEM_PROMPT = `Proactive multi-agent delegation is active. Use the Agent tool proactively when independent work can run in parallel. Give each subagent a focused task, keep coordination in the root agent, and synthesize the results. Do not delegate trivial or tightly coupled work.`

export function getUltraSystemPrompt(
  effort: EffortValue | undefined,
  isSubagent: boolean,
): string | undefined {
  return effort === 'ultra' && !isSubagent
    ? ULTRA_SYSTEM_PROMPT
    : undefined
}

export function resolveChildEffort(
  explicitEffort: EffortValue | undefined,
  parentEffort: EffortValue | undefined,
): EffortValue | undefined {
  if (explicitEffort !== undefined) {
    return explicitEffort
  }
  return parentEffort === 'ultra' ? 'max' : parentEffort
}
