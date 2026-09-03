import { afterEach, beforeEach, expect, test } from 'bun:test'
import { acquireSharedMutationLock, releaseSharedMutationLock } from '../../test/sharedMutationLock.js'

import {
  resolveCodexServiceTier,
  resolveProviderRequest,
  supportsCodexServiceTier,
} from './providerConfig.js'

const originalEnv = {
  OPENCLAUDE_CODEX_SERVICE_TIER: process.env.OPENCLAUDE_CODEX_SERVICE_TIER,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  CLAUDE_CODE_USE_GITHUB: process.env.CLAUDE_CODE_USE_GITHUB,
  CLAUDE_CODE_USE_MISTRAL: process.env.CLAUDE_CODE_USE_MISTRAL,
  CLAUDE_CODE_USE_GEMINI: process.env.CLAUDE_CODE_USE_GEMINI,
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

beforeEach(async () => {
  await acquireSharedMutationLock('providerConfig.serviceTier.test.ts')
  // Start from a clean slate so resolveProviderRequest resolves the model we pass.
  delete process.env.OPENCLAUDE_CODEX_SERVICE_TIER
  delete process.env.OPENAI_MODEL
  delete process.env.OPENAI_BASE_URL
  delete process.env.CLAUDE_CODE_USE_GITHUB
  delete process.env.CLAUDE_CODE_USE_MISTRAL
  delete process.env.CLAUDE_CODE_USE_GEMINI
})

afterEach(() => {
  try {
    for (const [key, value] of Object.entries(originalEnv)) {
      restoreEnv(key, value)
    }
  } finally {
    releaseSharedMutationLock()
  }
})

// --- supportsCodexServiceTier: Codex catalog models carrying Fast/priority ---

test('supportsCodexServiceTier includes the GPT-5.6 family plus legacy models', () => {
  expect(supportsCodexServiceTier('gpt-5.6-sol')).toBe(true)
  expect(supportsCodexServiceTier('gpt-5.6-terra')).toBe(true)
  expect(supportsCodexServiceTier('gpt-5.6-luna')).toBe(true)
  expect(supportsCodexServiceTier('gpt-5.5')).toBe(true)
  expect(supportsCodexServiceTier('gpt-5.4')).toBe(true)
  // case-insensitive + effort suffix tolerated
  expect(supportsCodexServiceTier('GPT-5.5')).toBe(true)
  expect(supportsCodexServiceTier('gpt-5.5?effort=low')).toBe(true)
})

test('supportsCodexServiceTier is false for spark / mini / codex / gpt-5.2', () => {
  expect(supportsCodexServiceTier('gpt-5.3-codex-spark')).toBe(false)
  expect(supportsCodexServiceTier('codexspark')).toBe(false)
  expect(supportsCodexServiceTier('gpt-5.3-codex')).toBe(false)
  expect(supportsCodexServiceTier('gpt-5.5-mini')).toBe(false)
  expect(supportsCodexServiceTier('gpt-5.4-mini')).toBe(false)
  expect(supportsCodexServiceTier('gpt-5.2')).toBe(false)
})

// --- resolveCodexServiceTier: env opt-in + model gate ---

test('resolveCodexServiceTier returns undefined when the env flag is unset', () => {
  expect(resolveCodexServiceTier('gpt-5.5')).toBeUndefined()
})

test('resolveCodexServiceTier returns "priority" for an explicit priority flag on a supported model', () => {
  process.env.OPENCLAUDE_CODEX_SERVICE_TIER = 'priority'
  expect(resolveCodexServiceTier('gpt-5.6-sol')).toBe('priority')
  expect(resolveCodexServiceTier('gpt-5.6-terra')).toBe('priority')
  expect(resolveCodexServiceTier('gpt-5.6-luna')).toBe('priority')
  expect(resolveCodexServiceTier('gpt-5.5')).toBe('priority')
  expect(resolveCodexServiceTier('gpt-5.4')).toBe('priority')
})

test('resolveCodexServiceTier treats a truthy flag (1/true/yes/on) as priority', () => {
  for (const flag of ['1', 'true', 'yes', 'on', 'TRUE']) {
    process.env.OPENCLAUDE_CODEX_SERVICE_TIER = flag
    expect(resolveCodexServiceTier('gpt-5.5')).toBe('priority')
  }
})

test('resolveCodexServiceTier returns undefined for unsupported models even when opted in', () => {
  process.env.OPENCLAUDE_CODEX_SERVICE_TIER = 'priority'
  expect(resolveCodexServiceTier('gpt-5.3-codex-spark')).toBeUndefined()
  expect(resolveCodexServiceTier('gpt-5.5-mini')).toBeUndefined()
  expect(resolveCodexServiceTier('gpt-5.2')).toBeUndefined()
})

test('resolveCodexServiceTier rejects unknown tier values', () => {
  process.env.OPENCLAUDE_CODEX_SERVICE_TIER = 'flex'
  expect(resolveCodexServiceTier('gpt-5.5')).toBeUndefined()
})

// --- resolveProviderRequest: serviceTier threads onto the resolved request ---

test('resolveProviderRequest attaches serviceTier=priority for Terra when opted in', () => {
  process.env.OPENCLAUDE_CODEX_SERVICE_TIER = 'priority'
  const resolved = resolveProviderRequest({ model: 'gpt-5.6-terra' })
  expect(resolved.resolvedModel).toBe('gpt-5.6-terra')
  expect(resolved.serviceTier).toBe('priority')
})

test('resolveProviderRequest omits serviceTier for spark even when opted in', () => {
  process.env.OPENCLAUDE_CODEX_SERVICE_TIER = 'priority'
  const resolved = resolveProviderRequest({ model: 'gpt-5.3-codex-spark' })
  expect(resolved.serviceTier).toBeUndefined()
})

test('resolveProviderRequest omits serviceTier when the flag is unset', () => {
  const resolved = resolveProviderRequest({ model: 'gpt-5.5' })
  expect(resolved.serviceTier).toBeUndefined()
})
