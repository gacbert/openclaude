import { beforeEach, afterEach, expect, test } from 'bun:test'
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../test/sharedMutationLock.js'
import {
  getContextWindowForModel,
  getModelMaxOutputTokens,
  has1mContext,
  modelUsesDefault1MContext,
} from './context.ts'
import {
  modelDefaultsToAdaptiveThinking,
  modelOnlySupportsAdaptiveThinking,
} from './thinking.ts'
import { modelSupportsStructuredOutputs } from './betas.ts'
import { getAvailableEffortLevels, resolveAppliedEffort } from './effort.ts'
import { getModelCosts } from './modelCost.ts'
import { getPublicModelDisplayName } from './model/model.ts'

// gacbert patch coverage: first-party Fable 5 / 5.1 support.
//
// The CLI ships no Fable entry for the anthropic route, and an unlisted
// first-party id degrades silently rather than erroring — 200k context, 32k
// output, effort clamped to `high`, budget-based thinking on count_tokens, and
// $5/$25 pricing. Every assertion below pins one of those gates.
//
// Both ids matter: getCanonicalName() collapses `claude-fable-5` and
// `claude-fable-5-1` to `claude-fable`, so one gate serves both, and a
// regression on either spelling is the same regression.
const FABLE_IDS = ['claude-fable-5-1', 'claude-fable-5']

const SAVED: Record<string, string | undefined> = {}
const MUTATED = [
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
  'CLAUDE_CODE_MAX_CONTEXT_TOKENS',
  'OPENAI_MODEL',
  'OPENAI_BASE_URL',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_PROVIDER_PROFILE_ENV_APPLIED',
  'USER_TYPE',
]

beforeEach(async () => {
  await acquireSharedMutationLock('fable.gacbert.test.ts')
  for (const key of MUTATED) {
    SAVED[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of MUTATED) {
    if (SAVED[key] === undefined) delete process.env[key]
    else process.env[key] = SAVED[key]
  }
  releaseSharedMutationLock()
})

test('Fable reports a native 1M window, with or without the [1m] tag', () => {
  for (const model of FABLE_IDS) {
    expect(modelUsesDefault1MContext(model)).toBe(true)
    // Bare id: this is the patch. Without it the CLI falls through to the
    // 200k MODEL_CONTEXT_WINDOW_DEFAULT and compacts ~5x early.
    expect(getContextWindowForModel(model)).toBe(1_000_000)
    // Tagged id: has1mContext() short-circuits ahead of everything, so the
    // Telegram bot's `claude-fable-5-1[1m]` alias keeps working either way.
    expect(getContextWindowForModel(`${model}[1m]`)).toBe(1_000_000)
  }
})

test('Fable does not carry the 1M opt-in beta header', () => {
  // A natively-1M model must not send context-1m-2025-08-07. betas.ts gates
  // that header on has1mContext() && !modelUsesDefault1MContext(), so listing
  // Fable in the latter is what suppresses it for the tagged id.
  for (const model of FABLE_IDS) {
    // betas.ts gates the header on exactly this predicate; asserting it
    // directly avoids the memoized accessor's cache bleeding across tests.
    expect(
      has1mContext(`${model}[1m]`) &&
        !modelUsesDefault1MContext(`${model}[1m]`),
    ).toBe(false)
  }
})

test('Fable allows 128k output', () => {
  for (const model of FABLE_IDS) {
    expect(getModelMaxOutputTokens(model)).toEqual({
      default: 64_000,
      upperLimit: 128_000,
    })
  }
})

test('Fable is adaptive-only, never default-adaptive', () => {
  for (const model of FABLE_IDS) {
    // Rejects legacy budget_tokens thinking (a 400 on the wire).
    expect(modelOnlySupportsAdaptiveThinking(model)).toBe(true)
    // Must stay false: this gate is what lets `--max-thinking-tokens 0` emit
    // thinking:{type:'disabled'}, which Fable also rejects with a 400.
    expect(modelDefaultsToAdaptiveThinking(model)).toBe(false)
  }
})

test('Fable supports structured outputs on the first-party API', () => {
  for (const model of FABLE_IDS) {
    expect(modelSupportsStructuredOutputs(model)).toBe(true)
  }
})

test('Fable is priced at the $10/$50 tier, not the unknown-model default', () => {
  for (const model of FABLE_IDS) {
    const costs = getModelCosts(model, {
      speed: 'standard',
    } as unknown as Parameters<typeof getModelCosts>[1])
    expect(costs.inputTokens).toBe(10)
    expect(costs.outputTokens).toBe(50)
  }
})

test('Fable display names distinguish 5.1 from 5', () => {
  expect(getPublicModelDisplayName('claude-fable-5-1')).toBe('Fable 5.1')
  expect(getPublicModelDisplayName('claude-fable-5-1[1m]')).toBe('Fable 5.1')
  expect(getPublicModelDisplayName('claude-fable-5')).toBe('Fable 5')
  expect(getPublicModelDisplayName('claude-fable-5[1m]')).toBe('Fable 5')
})

test('Fable accepts the full low..max effort range', () => {
  for (const model of FABLE_IDS) {
    const levels = getAvailableEffortLevels(model)
    // Before the patch an unlisted first-party id fell out of the xhigh and
    // max allowlists, leaving ['low','medium','high'] — so /effort max and
    // /effort xhigh both silently executed at `high`.
    expect(levels).toContain('xhigh')
    expect(levels).toContain('max')
  }
})

test('Fable effort is passed through, not clamped down to high', () => {
  for (const model of FABLE_IDS) {
    expect(resolveAppliedEffort(model, 'max')).toBe('max')
    expect(resolveAppliedEffort(model, 'xhigh')).toBe('xhigh')
    expect(resolveAppliedEffort(model, 'high')).toBe('high')
    // ultracode has no permission grant on Fable and must still land on the
    // ordinary ceiling rather than leaking an unsupported wire value.
    expect(resolveAppliedEffort(model, 'ultracode')).not.toBe('ultracode')
  }
})
