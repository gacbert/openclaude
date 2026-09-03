import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../test/sharedMutationLock.js'
import * as realAuth from './auth.js'
import { isBilledAsExtraUsage } from './extraUsage.js'

const PROVIDER_ENV_KEYS = [
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_MISTRAL',
  'CLAUDE_CODE_USE_GITHUB',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'ANTHROPIC_BASE_URL',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'OPENAI_MODEL',
  'FIREWORKS_API_KEY',
  'LONGCAT_API_KEY',
  'NEARAI_API_KEY',
  'NVIDIA_NIM',
  'MINIMAX_API_KEY',
  'XAI_API_KEY',
  'VENICE_API_KEY',
  'MIMO_API_KEY',
  'CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED',
  'CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED_ID',
] as const

function clearProviderEnv(): void {
  for (const key of PROVIDER_ENV_KEYS) {
    delete process.env[key]
  }
}

beforeEach(async () => {
  await acquireSharedMutationLock('utils/extraUsage.test.ts')
  clearProviderEnv()
  delete process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT
  mock.module('./auth.js', () => ({
    ...realAuth,
    isClaudeAISubscriber: () => true,
  }))
})

afterEach(() => {
  try {
    clearProviderEnv()
    mock.restore()
    mock.module('./auth.js', () => realAuth)
  } finally {
    releaseSharedMutationLock()
  }
})

test('native Opus 4.8 is exempt while compatibility 4.7/4.6 remain extra usage', () => {
  expect(isBilledAsExtraUsage('claude-opus-4-8[1m]', false, false)).toBe(false)
  expect(isBilledAsExtraUsage('claude-opus-4-7[1m]', false, false)).toBe(true)
  expect(isBilledAsExtraUsage('opus[1m]', false, false)).toBe(true)
  expect(isBilledAsExtraUsage('claude-opus-4-6[1m]', false, false)).toBe(true)
})

test('1M Opus is not billed as extra when the Opus 1M merge is enabled', () => {
  expect(isBilledAsExtraUsage('claude-opus-4-8[1m]', false, true)).toBe(false)
  expect(isBilledAsExtraUsage('claude-opus-4-7[1m]', false, true)).toBe(false)
  expect(isBilledAsExtraUsage('opus[1m]', false, true)).toBe(false)
})

test('non-1M models are not billed as extra usage', () => {
  expect(isBilledAsExtraUsage('claude-opus-4-8', false, false)).toBe(false)
})

test('native first-party Opus 5 context is not billed as extra usage', () => {
  expect(isBilledAsExtraUsage('claude-opus-5[1m]', false, false)).toBe(false)
})

test('native Sonnet 5 context is not billed as extra on supported providers', () => {
  expect(isBilledAsExtraUsage('claude-sonnet-5[1m]', false, false)).toBe(false)

  process.env.CLAUDE_CODE_USE_BEDROCK = '1'
  expect(
    isBilledAsExtraUsage(
      'us.anthropic.claude-sonnet-5[1m]',
      false,
      false,
    ),
  ).toBe(false)

  delete process.env.CLAUDE_CODE_USE_BEDROCK
  process.env.CLAUDE_CODE_USE_VERTEX = '1'
  expect(isBilledAsExtraUsage('claude-sonnet-5[1m]', false, false)).toBe(false)
})

test('custom Anthropic proxies do not assume native Sonnet 5 billing', () => {
  process.env.ANTHROPIC_BASE_URL = 'https://tenant.example'
  expect(isBilledAsExtraUsage('claude-sonnet-5[1m]', false, false)).toBe(true)
})

test('Bedrock Opus 5 compatibility 1M remains billed as extra usage', () => {
  process.env.CLAUDE_CODE_USE_BEDROCK = '1'
  expect(
    isBilledAsExtraUsage(
      'us.anthropic.claude-opus-5[1m]',
      false,
      false,
    ),
  ).toBe(true)
  expect(
    isBilledAsExtraUsage('us.anthropic.claude-opus-5[1m]', false, true),
  ).toBe(false)
})

test('Vertex Opus 5 compatibility 1M remains billed as extra usage', () => {
  process.env.CLAUDE_CODE_USE_VERTEX = '1'
  expect(
    isBilledAsExtraUsage('claude-opus-5[1m]', false, false),
  ).toBe(true)
  expect(
    isBilledAsExtraUsage('claude-opus-5[1m]', false, true),
  ).toBe(false)
})
