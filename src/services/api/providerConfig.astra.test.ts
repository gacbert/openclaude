import { expect, test } from 'bun:test'

import gptModels from '../../integrations/models/gpt.js'
import openaiVendor from '../../integrations/vendors/openai.js'
import { getPublicModelDisplayName, parseUserSpecifiedModel } from '../../utils/model/model.js'
import {
  modelRequiresResponsesApi,
  resolveProviderRequest,
  supportsCodexReasoningEffort,
  supportsCodexServiceTier,
} from './providerConfig.js'

// gacbert patch coverage: GPT-6 Astra (2026-09-05).
//
// Astra is a new generation, so every gate keyed on the "gpt-5 family" would
// silently misroute it: chat/completions instead of /v1/responses (where its
// `max` effort lives), no reasoning effort sent, and the 128k/258k fallback
// context window. These assertions pin each gate plus the two deliberate
// policy decisions — a 272k context cap and no Fast tier.

test('Astra is routed to /v1/responses like the 5.x family', () => {
  for (const model of ['gpt-6-astra', 'GPT-6-ASTRA', 'gpt-6', 'gpt-6-astra?reasoning=max']) {
    expect(modelRequiresResponsesApi(model)).toBe(true)
  }
  // gpt-60-style ids stay unmatched, as do the 5.x two-digit minors.
  for (const model of ['gpt-60', 'gpt-60-astra', 'gpt-5.10-astra', 'gpt-6-mini']) {
    expect(modelRequiresResponsesApi(model)).toBe(false)
  }
})

test('Astra is inside the Codex-served GPT family (effort is sent)', () => {
  expect(supportsCodexReasoningEffort('gpt-6-astra')).toBe(true)
  expect(supportsCodexReasoningEffort('gpt-5.6-sol')).toBe(true)
  expect(supportsCodexReasoningEffort('gpt-60')).toBe(false)
})

test('Astra deliberately has no Fast/priority tier', () => {
  // 2.5x standard credits on a rationed allowance — /fast is a no-op here.
  expect(supportsCodexServiceTier('gpt-6-astra')).toBe(false)
  expect(supportsCodexServiceTier('gpt-5.6-sol')).toBe(true)
})

test('Astra defaults to medium reasoning', () => {
  const astra = resolveProviderRequest({ model: 'gpt-6-astra', processEnv: {} })
  expect(astra.resolvedModel).toBe('gpt-6-astra')
  expect(astra.reasoning).toEqual({ effort: 'medium' })
})

test('Astra is capped at 272k on both catalogs, with max as a real level', () => {
  const descriptor = gptModels.find(model => model.id === 'gpt-6-astra')
  expect(descriptor?.contextWindow).toBe(272_000)
  expect(descriptor?.maxOutputTokens).toBe(128_000)

  const entry = openaiVendor.catalog?.models?.find(model => model.id === 'gpt-6-astra')
  expect(entry?.contextWindow).toBe(272_000)
  expect(entry?.maxOutputTokens).toBe(128_000)
  expect(entry?.reasoning?.levels).toContain('max')
  expect(entry?.reasoning?.wireFormat).toBe('reasoning_effort')
})

test('the explicit Astra id passes through parseUserSpecifiedModel unchanged', () => {
  expect(parseUserSpecifiedModel('gpt-6-astra')).toBe('gpt-6-astra')
})

test('Astra has a display name', () => {
  expect(getPublicModelDisplayName('gpt-6-astra')).toBe('GPT-6 Astra')
})
