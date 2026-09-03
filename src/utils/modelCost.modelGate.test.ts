import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../test/sharedMutationLock.js'
import * as realFastMode from './fastMode.js'

async function importFreshModelCost() {
  return import(`./modelCost.js?ts=${Date.now()}-${Math.random()}`)
}

beforeEach(async () => {
  await acquireSharedMutationLock('utils/modelCost.modelGate.test.ts')
})

afterEach(() => {
  try {
    mock.restore()
    mock.module('./fastMode.js', () => realFastMode)
  } finally {
    releaseSharedMutationLock()
  }
})

test('unknown models do not inherit the configured default model price', async () => {
  mock.module('./model/model.js', () => ({
    firstPartyNameToCanonical: (model: string) => {
      if (model.includes('claude-haiku-4-5')) return 'claude-haiku-4-5'
      return model
    },
    getCanonicalName: (model: string) => {
      if (model.includes('claude-haiku-4-5')) return 'claude-haiku-4-5'
      return model
    },
    getDefaultMainLoopModelSetting: () => 'claude-haiku-4-5',
  }))
  const { getModelCosts, COST_HAIKU_45, COST_TIER_5_25 } =
    await importFreshModelCost()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usage = {} as any
  const costs = getModelCosts('meta/llama-3.3-70b-instruct', usage)

  expect(costs).toEqual(COST_TIER_5_25)
  expect(costs).not.toEqual(COST_HAIKU_45)
})

test('fast-mode Opus 5 and 4.8 use the current 2x tier', async () => {
  mock.module('./fastMode.js', () => ({
    ...realFastMode,
    isFastModeEnabled: () => true,
  }))
  const { getModelCosts, COST_TIER_10_50, COST_TIER_5_25 } =
    await importFreshModelCost()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fast = { speed: 'fast' } as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const standard = { speed: 'standard' } as any

  expect(getModelCosts('claude-opus-5', fast)).toEqual(COST_TIER_10_50)
  expect(getModelCosts('claude-opus-4-8', fast)).toEqual(COST_TIER_10_50)
  expect(getModelCosts('claude-opus-4-8', standard)).toEqual(COST_TIER_5_25)
  expect(getModelCosts('claude-opus-5', standard)).toEqual(COST_TIER_5_25)
})

test('legacy Opus models no longer receive fast pricing', async () => {
  mock.module('./fastMode.js', () => ({
    ...realFastMode,
    isFastModeEnabled: () => true,
  }))
  const { getModelCosts, COST_TIER_5_25 } = await importFreshModelCost()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fast = { speed: 'fast' } as any

  expect(getModelCosts('claude-opus-4-7', fast)).toEqual(COST_TIER_5_25)
  expect(getModelCosts('claude-opus-4-6', fast)).toEqual(COST_TIER_5_25)
})

test('fast-mode Opus 5 prices 5-minute and 1-hour cache writes separately', async () => {
  mock.module('./fastMode.js', () => ({
    ...realFastMode,
    isFastModeEnabled: () => true,
  }))
  const { calculateUSDCost } = await importFreshModelCost()
  const usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 2_000_000,
    cache_creation: {
      ephemeral_5m_input_tokens: 1_000_000,
      ephemeral_1h_input_tokens: 1_000_000,
    },
    speed: 'fast',
  } as any

  expect(calculateUSDCost('claude-opus-5', usage)).toBe(32.5)
})

test('Sonnet 5 pricing switches at the exact September 2026 boundary', async () => {
  const { getKnownModelCosts, getSonnet5CostTier } =
    await importFreshModelCost()
  const promo = {
    inputTokens: 2,
    outputTokens: 10,
    promptCacheWriteTokens: 2.5,
    promptCacheWrite1hTokens: 4,
    promptCacheReadTokens: 0.2,
    webSearchRequests: 0.01,
  }
  const standard = {
    inputTokens: 3,
    outputTokens: 15,
    promptCacheWriteTokens: 3.75,
    promptCacheWrite1hTokens: 6,
    promptCacheReadTokens: 0.3,
    webSearchRequests: 0.01,
  }

  expect(getSonnet5CostTier(Date.UTC(2026, 7, 31, 23, 59, 59, 999))).toEqual(
    promo,
  )
  expect(getSonnet5CostTier(Date.UTC(2026, 8, 1, 0, 0, 0, 0))).toEqual(
    standard,
  )

  const originalDateNow = Date.now
  try {
    Date.now = () => Date.UTC(2026, 7, 31, 23, 59, 59, 999)
    expect(getKnownModelCosts('claude-sonnet-5')).toEqual(promo)
    Date.now = () => Date.UTC(2026, 8, 1, 0, 0, 0, 0)
    expect(getKnownModelCosts('claude-sonnet-5')).toEqual(standard)
  } finally {
    Date.now = originalDateNow
  }
})
