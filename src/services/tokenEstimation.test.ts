import type { Anthropic } from '@anthropic-ai/sdk'
import { expect, mock, test } from 'bun:test'
import { jsonStringify } from '../utils/slowOperations.js'
import {
  __test,
  getBytesPerTokenForModel,
  roughTokenCountEstimation,
} from './tokenEstimation.js'

function createTextTool(): Anthropic.Beta.Messages.BetaToolUnion {
  return {
    name: 'lookup_docs',
    description: 'Look up project documentation.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  }
}

test('countMessagesTokensWithClient falls back when shim client lacks countTokens', async () => {
  const content = 'hello from an openai-compatible provider'

  const result = await __test.countMessagesTokensWithClient({
    messagesClient: {},
    model: 'gpt-4o',
    messages: [{ role: 'user', content }],
    tools: [],
    filteredBetas: [],
    containsThinking: false,
  })

  expect(result).toBe(roughTokenCountEstimation(content))
})

test('countMessagesTokensWithClient includes tool overhead in fallback estimates', async () => {
  const content = 'count this request with tool definitions'
  const tools = [createTextTool()]

  const result = await __test.countMessagesTokensWithClient({
    messagesClient: {},
    model: 'gpt-4o',
    messages: [{ role: 'user', content }],
    tools,
    filteredBetas: [],
    containsThinking: false,
  })

  expect(result).toBe(
    roughTokenCountEstimation(content) +
      500 +
      roughTokenCountEstimation(jsonStringify(tools)),
  )
})

test('countMessagesTokensWithClient uses countTokens when the client supports it', async () => {
  const countTokens = mock(async (_params: unknown) => ({ input_tokens: 42 }))
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    { role: 'user', content: 'use exact count when available' },
  ]

  const result = await __test.countMessagesTokensWithClient({
    messagesClient: {
      countTokens:
        countTokens as unknown as Anthropic['beta']['messages']['countTokens'],
    },
    model: 'gpt-4o',
    messages,
    tools: [],
    filteredBetas: [],
    containsThinking: false,
  })

  expect(countTokens).toHaveBeenCalledTimes(1)
  expect(countTokens.mock.calls[0]?.[0]).toEqual({
    model: 'gpt-4o',
    messages,
    tools: [],
  })
  expect(result).toBe(42)
})

test('Sonnet 5 token counting uses adaptive thinking instead of a manual budget', async () => {
  const countTokens = mock(async (_params: unknown) => ({ input_tokens: 42 }))

  await __test.countMessagesTokensWithClient({
    messagesClient: {
      countTokens:
        countTokens as unknown as Anthropic['beta']['messages']['countTokens'],
    },
    model: 'claude-sonnet-5',
    messages: [{ role: 'user', content: 'count adaptive thinking' }],
    tools: [],
    filteredBetas: [],
    containsThinking: true,
  })

  expect(countTokens.mock.calls[0]?.[0]).toMatchObject({
    model: 'claude-sonnet-5',
    thinking: { type: 'adaptive' },
  })
  expect(__test.getTokenCountingThinkingConfig('claude-sonnet-4-6')).toEqual({
    type: 'enabled',
    budget_tokens: 1024,
  })
})

test('Sonnet 5 uses its conservative tokenizer ratio in the real fallback', async () => {
  expect(getBytesPerTokenForModel('claude-sonnet-5')).toBe(2.7)
  expect(getBytesPerTokenForModel('claude-sonnet-4-6')).toBe(3.5)

  const content = 'sonnet five fallback token estimate'
  const result = await __test.countMessagesTokensWithClient({
    messagesClient: {},
    model: 'claude-sonnet-5',
    messages: [{ role: 'user', content }],
    tools: [],
    filteredBetas: [],
    containsThinking: false,
  })
  expect(result).toBe(roughTokenCountEstimation(content, 2.7))
})
