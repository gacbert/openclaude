import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import {
  getAllowedSettingSources,
  getFlagSettingsInline,
  getFlagSettingsPath,
  hasUnknownModelCost,
  resetCostState,
  setAllowedSettingSources,
  setFlagSettingsInline,
  setFlagSettingsPath,
} from '../bootstrap/state.js'
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../test/sharedMutationLock.js'
import * as realFastMode from './fastMode.js'
import * as realModel from './model/model.js'
import { resetSettingsCache } from './settings/settingsCache.js'

const realModelSnapshot = { ...realModel }

type PricingOverride = {
  inputTokens: number
  outputTokens: number
  promptCacheReadTokens: number
  promptCacheWriteTokens: number
  webSearchRequests: number
}

let pricingByModel: Record<string, PricingOverride>
let originalSources: ReturnType<typeof getAllowedSettingSources>
let originalFlagPath: string | undefined
let originalFlagInline: Record<string, unknown> | null

async function importFreshModelCost() {
  return import(`./modelCost.js?ts=${Date.now()}-${Math.random()}`)
}

beforeEach(async () => {
  await acquireSharedMutationLock('utils/modelCost.modelGate.test.ts')
  originalSources = [...getAllowedSettingSources()]
  originalFlagPath = getFlagSettingsPath()
  originalFlagInline = getFlagSettingsInline()
  pricingByModel = Object.create(null) as Record<string, PricingOverride>
  setAllowedSettingSources(['flagSettings'])
  setFlagSettingsPath(undefined)
  setFlagSettingsInline({ modelPricing: pricingByModel })
  resetSettingsCache()
})

afterEach(() => {
  try {
    mock.restore()
    mock.module('./fastMode.js', () => realFastMode)
    mock.module('./model/model.js', () => realModelSnapshot)
    setAllowedSettingSources(originalSources)
    setFlagSettingsPath(originalFlagPath)
    setFlagSettingsInline(originalFlagInline)
    resetSettingsCache()
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

// MODEL_COSTS is a plain object, so a bare `MODEL_COSTS[shortName]` lookup
// inherits Object.prototype members. A model id of `constructor` or `__proto__`
// (both valid arbitrary ids for custom/OpenAI-compatible providers, and already
// lowercase so getCanonicalName returns them unchanged) resolved to a truthy
// prototype value, bypassing the `!costs` unknown-model guard: the cost math
// then read undefined fields and produced NaN, which flowed into the running
// session total and stuck it at $NaN. (getModelPricingString has no production
// callers; pre-fix it threw a TypeError from formatPrice(undefined) for these
// ids -- the own-property guard makes it return undefined instead.)
test('proto-member model ids fall through the unknown-model path, not NaN', async () => {
  mock.module('./model/model.js', () => ({
    firstPartyNameToCanonical: (model: string) => model,
    // Mirror the real canonicalizer for these names: both are lowercase and
    // match no Claude pattern, so they pass through verbatim.
    getCanonicalName: (model: string) => model,
    getDefaultMainLoopModelSetting: () => 'claude-haiku-4-5',
  }))
  const { getModelCosts, getModelPricingString, calculateUSDCost, COST_TIER_5_25 } =
    await importFreshModelCost()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usage = {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any

  try {
    for (const name of ['constructor', '__proto__']) {
      // DEFAULT_UNKNOWN_MODEL_COST is COST_TIER_5_25 (see modelCost.ts).
      expect(getModelCosts(name, usage)).toEqual(COST_TIER_5_25)
      const cost = calculateUSDCost(name, usage)
      // Number.isFinite rejects Infinity too, not just NaN.
      expect(Number.isFinite(cost)).toBe(true)
      expect(cost).toBeGreaterThan(0)
      expect(getModelPricingString(name)).toBeUndefined()
    }
    // Lock in the unknown-model detection path: dropping trackUnknownModelCost
    // while keeping the fallback tier would otherwise still pass the checks above.
    expect(hasUnknownModelCost()).toBe(true)
  } finally {
    // Clear the process-wide flag so this suite cannot leak into another.
    resetCostState()
  }
})

test('exact unknown-model override prices every usage field and suppresses the unknown warning', async () => {
  const model = 'provider/model:v1?profile=paid'
  pricingByModel[model] = {
    inputTokens: 1,
    outputTokens: 2,
    promptCacheReadTokens: 3,
    promptCacheWriteTokens: 4,
    webSearchRequests: 5,
  }
  const {
    calculateUSDCost,
    calculateCostFromTokens,
    getModelCosts,
    getModelPricingString,
  } = await importFreshModelCost()
  const usage = {
    input_tokens: 1_000_000,
    output_tokens: 2_000_000,
    cache_read_input_tokens: 3_000_000,
    cache_creation_input_tokens: 4_000_000,
    server_tool_use: { web_search_requests: 2 },
  } as Parameters<typeof calculateUSDCost>[1]

  // gacbert: this fork's ModelCosts prices 1h cache writes separately; a custom
  // override cannot express that field, so it is derived as 1.6x the 5m rate.
  expect(getModelCosts(model, usage)).toEqual({
    ...pricingByModel[model],
    promptCacheWrite1hTokens:
      pricingByModel[model].promptCacheWriteTokens * 1.6,
  })
  expect(calculateUSDCost(model, usage)).toBe(40)
  expect(
    calculateCostFromTokens(model, {
      inputTokens: 1_000_000,
      outputTokens: 2_000_000,
      cacheReadInputTokens: 3_000_000,
      cacheCreationInputTokens: 4_000_000,
    }),
  ).toBe(30)
  expect(getModelPricingString(model)).toBe('$1/$2 per Mtok')
  expect(hasUnknownModelCost()).toBe(false)
})

test('all-zero exact override is authoritative for unknown and fast-mode known models', async () => {
  const zero = {
    inputTokens: 0,
    outputTokens: 0,
    promptCacheReadTokens: 0,
    promptCacheWriteTokens: 0,
    webSearchRequests: 0,
  }
  pricingByModel['nvidia/free-model'] = zero
  pricingByModel['claude-opus-4-8'] = zero
  mock.module('./fastMode.js', () => ({
    ...realFastMode,
    isFastModeEnabled: () => true,
  }))
  const { calculateUSDCost, getModelCosts, getModelPricingString } =
    await importFreshModelCost()
  const usage = {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
    cache_creation_input_tokens: 1_000_000,
    server_tool_use: { web_search_requests: 1 },
    speed: 'fast',
  } as Parameters<typeof calculateUSDCost>[1]

  for (const model of ['nvidia/free-model', 'claude-opus-4-8']) {
    expect(getModelCosts(model, usage)).toEqual({
      ...zero,
      promptCacheWrite1hTokens: zero.promptCacheWriteTokens * 1.6,
    })
    expect(calculateUSDCost(model, usage)).toBe(0)
    expect(getModelPricingString(model)).toBe('$0/$0 per Mtok')
  }
  expect(hasUnknownModelCost()).toBe(false)
})

test('custom pricing matches exact resolved ids only, including unusual own keys', async () => {
  mock.restore()
  mock.module('./fastMode.js', () => realFastMode)
  mock.module('./model/model.js', () => realModelSnapshot)
  const configured = {
    inputTokens: 7,
    outputTokens: 11,
    promptCacheReadTokens: 1,
    promptCacheWriteTokens: 2,
    webSearchRequests: 0.5,
  }
  const exact = 'Provider/model:v1?route=alpha'
  pricingByModel[exact] = configured
  for (const model of ['constructor', 'toString', '__proto__']) {
    Object.defineProperty(pricingByModel, model, {
      configurable: true,
      enumerable: true,
      value: configured,
      writable: true,
    })
  }
  const {
    calculateUSDCost,
    getModelCosts,
    COST_TIER_5_25,
    DEFAULT_UNKNOWN_MODEL_COST,
  } = await importFreshModelCost()
  const usage = {
    input_tokens: 1_000_000,
    output_tokens: 0,
  } as Parameters<typeof calculateUSDCost>[1]

  for (const model of [exact, 'constructor', 'toString', '__proto__']) {
    expect(calculateUSDCost(model, usage)).toBe(7)
  }
  resetCostState()
  for (const nearMatch of [
    exact.toLowerCase(),
    exact.slice(0, -1),
    `${exact}/child`,
  ]) {
    expect(getModelCosts(nearMatch, usage)).toEqual(
      DEFAULT_UNKNOWN_MODEL_COST,
    )
  }
  expect(hasUnknownModelCost()).toBe(true)

  resetCostState()
  expect(getModelCosts('claude-opus-4-8-20260815', usage)).toEqual(
    COST_TIER_5_25,
  )
  expect(hasUnknownModelCost()).toBe(false)
})
