import { describe, expect, test } from 'bun:test'
import type { CustomAgentDefinition } from '../../tools/AgentTool/loadAgentsDir.js'
import { buildInProcessAgentDefinition } from './inProcessAgentDefinition.js'

function customAgentWithEffort(
  effort: NonNullable<CustomAgentDefinition['effort']>,
): CustomAgentDefinition {
  return {
    agentType: 'researcher',
    whenToUse: 'Research a focused question',
    getSystemPrompt: () => 'Research carefully.',
    source: 'projectSettings',
    effort,
  }
}

describe('buildInProcessAgentDefinition', () => {
  test('preserves the custom model ahead of the leader default', () => {
    const resolved = buildInProcessAgentDefinition({
      agentName: 'researcher',
      teammateSystemPrompt: 'Teammate prompt',
      agentDefinition: {
        ...customAgentWithEffort('high'),
        model: 'gpt-5.6-terra',
      },
      defaultModel: 'gpt-5.6-sol',
    })

    expect(resolved.model).toBe('gpt-5.6-terra')
    expect(resolved.effort).toBe('high')
  })

  test.each([
    ['ultra', 'ultra'],
    ['numeric zero', 0],
  ] as const)('preserves %s custom effort', (_label, effort) => {
    const resolved = buildInProcessAgentDefinition({
      agentName: 'researcher',
      teammateSystemPrompt: 'Teammate prompt',
      agentDefinition: customAgentWithEffort(effort),
      defaultModel: 'default-model',
    })

    expect(resolved.effort).toBe(effort)
  })
})
