import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import type {
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { Stream } from '@anthropic-ai/sdk/streaming.mjs'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../../test/sharedMutationLock.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import type { EffortValue } from '../../utils/effort.js'
import { QueryLifecycleOperationTracker } from '../../utils/queryLifecycle.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import type { ThinkingConfig } from '../../utils/thinking.js'
import { resetGrowthBook } from '../analytics/growthbook.js'
import type { Options } from './claude.js'
import { EMPTY_USAGE } from './emptyUsage.js'

const actualClientModule = await import('./client.js')
const originalEnv = { ...process.env }
const hadSavedMacro = Object.hasOwn(globalThis, 'MACRO')
const savedMacro = (globalThis as Record<string, unknown>).MACRO
const envKeys = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING',
  'CLAUDE_CODE_DISABLE_THINKING',
  'CLAUDE_CODE_EFFORT_LEVEL',
  'CLAUDE_CODE_TEST_FIXTURES_ROOT',
  'CLAUDE_DISABLE_STREAM_WATCHDOG',
  'CLAUDE_FEATURE_FLAGS_FILE',
  'OPENCLAUDE_MAX_RETRIES',
  'VCR_RECORD',
] as const

type CreateArgs = [
  BetaMessageStreamParams & { stream?: boolean },
  Record<string, unknown> | undefined,
]

let fixturesRoot: string | undefined
let importCounter = 0
let capturedParams: CreateArgs[0] | undefined
let restoreClientSpy: (() => void) | undefined

function makeBetaMessage(): BetaMessage {
  return {
    id: 'msg-opus-5-request-test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [],
    container: null,
    context_management: null,
    stop_details: null,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      ...EMPTY_USAGE,
      input_tokens: 1,
      output_tokens: 1,
    },
  }
}

function makeCompleteStream(): Stream<BetaRawMessageStreamEvent> {
  const events: BetaRawMessageStreamEvent[] = [
    { type: 'message_start', message: makeBetaMessage() },
    {
      type: 'message_delta',
      context_management: null,
      delta: {
        container: null,
        stop_details: null,
        stop_reason: 'end_turn',
        stop_sequence: null,
      },
      usage: {
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        input_tokens: null,
        iterations: null,
        output_tokens: 1,
        server_tool_use: null,
      },
    },
    { type: 'message_stop' },
  ]
  const controller = new AbortController()

  return {
    controller,
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        const value = events.shift()
        return value === undefined
          ? { done: true, value: undefined }
          : { done: false, value }
      },
    }),
  } as Stream<BetaRawMessageStreamEvent>
}

function installClientSpy(): void {
  const clientSpy = spyOn(
    actualClientModule,
    'getAnthropicClient',
  ).mockImplementation(
    async () =>
      ({
        beta: {
          messages: {
            create: (...args: CreateArgs) => {
              capturedParams = args[0]
              return {
                withResponse: async () => ({
                  data: makeCompleteStream(),
                  request_id: 'req-opus-5-request-test',
                  response: new Response('', {
                    headers: { 'request-id': 'req-opus-5-request-test' },
                  }),
                }),
              }
            },
          },
        },
      }) as never,
  )
  restoreClientSpy = () => clientSpy.mockRestore()
}

function setTestMacro(): void {
  ;(globalThis as Record<string, unknown>).MACRO = {
    VERSION: '0.0.0-test',
    DISPLAY_VERSION: '0.0.0-test',
    BUILD_TIME: 'test',
    ISSUES_EXPLAINER: 'test',
    PACKAGE_URL: 'test',
    NATIVE_PACKAGE_URL: undefined,
  }
}

function makeMessages(sequence: number): Message[] {
  return [
    {
      type: 'user',
      uuid: `00000000-0000-0000-0000-${String(sequence).padStart(12, '0')}`,
      timestamp: '2026-07-26T00:00:00.000Z',
      message: { role: 'user', content: `hello ${sequence}` },
    } as Message,
  ]
}

function makeOptions(
  model: string,
  effortValue?: EffortValue,
  temperatureOverride?: number,
  taskBudget?: Options['taskBudget'],
): Options {
  return {
    getToolPermissionContext: async () => getEmptyToolPermissionContext(),
    model,
    isNonInteractiveSession: false,
    querySource: 'sdk',
    agents: [],
    hasAppendSystemPrompt: false,
    mcpTools: [],
    effortValue,
    temperatureOverride,
    taskBudget,
    queryLifecycle: new QueryLifecycleOperationTracker(),
  }
}

async function captureRequest(
  model: string,
  thinkingConfig: ThinkingConfig,
  effortValue?: EffortValue,
  temperatureOverride?: number,
  taskBudget?: Options['taskBudget'],
): Promise<CreateArgs[0]> {
  capturedParams = undefined
  const sequence = importCounter++
  const { queryModelWithStreaming } = await import(
    `./claude.js?opus-5-request-test-${sequence}`
  )

  for await (const _message of queryModelWithStreaming({
    messages: makeMessages(sequence),
    systemPrompt: asSystemPrompt([]),
    thinkingConfig,
    tools: [],
    signal: new AbortController().signal,
    options: makeOptions(model, effortValue, temperatureOverride, taskBudget),
  })) {
    // Drain the request so the streaming path performs normal cleanup.
  }

  if (!capturedParams) {
    throw new Error('Anthropic request was not captured')
  }
  return capturedParams
}

beforeEach(async () => {
  await acquireSharedMutationLock('claude.opus5Request.test.ts')
  installClientSpy()
  setTestMacro()
  for (const key of envKeys) {
    delete process.env[key]
  }
  fixturesRoot = mkdtempSync(join(tmpdir(), 'claude-opus-5-request-vcr-'))
  process.env.ANTHROPIC_API_KEY = 'sk-test-opus-5-request'
  process.env.CLAUDE_CODE_TEST_FIXTURES_ROOT = fixturesRoot
  process.env.CLAUDE_FEATURE_FLAGS_FILE = join(
    fixturesRoot,
    'feature-flags.json',
  )
  process.env.CLAUDE_DISABLE_STREAM_WATCHDOG = '1'
  process.env.OPENCLAUDE_MAX_RETRIES = '0'
  process.env.VCR_RECORD = '1'
  resetGrowthBook()
})

afterEach(() => {
  try {
    restoreClientSpy?.()
    restoreClientSpy = undefined
    capturedParams = undefined
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalEnv[key]
      }
    }
    if (hadSavedMacro) {
      ;(globalThis as Record<string, unknown>).MACRO = savedMacro
    } else {
      delete (globalThis as Record<string, unknown>).MACRO
    }
    resetGrowthBook()
    if (fixturesRoot) {
      rmSync(fixturesRoot, { force: true, recursive: true })
      fixturesRoot = undefined
    }
  } finally {
    releaseSharedMutationLock()
  }
})

describe('Opus 5 Anthropic request parameters', () => {
  test('relies on omission for the default adaptive-thinking request', async () => {
    const request = await captureRequest(
      'claude-opus-5',
      { type: 'adaptive' },
      'high',
    )

    expect(request.thinking).toBeUndefined()
    expect(request.temperature).toBeUndefined()
  })

  test('serializes an effective disable and caps incompatible effort', async () => {
    for (const effort of ['xhigh', 'max', 'ultra'] as const) {
      const request = await captureRequest(
        'claude-opus-5',
        { type: 'disabled' },
        effort,
        0.2,
      )

      expect(request.thinking).toEqual({ type: 'disabled' })
      expect(request.output_config?.effort).toBe('high')
      expect(request.temperature).toBeUndefined()
    }
  })

  test('honors the global thinking disable explicitly', async () => {
    process.env.CLAUDE_CODE_DISABLE_THINKING = '1'
    const request = await captureRequest(
      'claude-opus-5',
      { type: 'adaptive' },
      'xhigh',
    )

    expect(request.thinking).toEqual({ type: 'disabled' })
    expect(request.output_config?.effort).toBe('high')
    expect(request.temperature).toBeUndefined()
  })

  test('does not cap effort for earlier Opus models with thinking disabled', async () => {
    for (const [model, effort] of [
      ['claude-opus-4-8', 'max'],
      ['claude-opus-4-7', 'xhigh'],
    ] as const) {
      const request = await captureRequest(
        model,
        { type: 'disabled' },
        effort,
      )

      expect(request.thinking).toBeUndefined()
      expect(request.output_config?.effort).toBe(effort)
      expect(request.temperature).toBeUndefined()
    }
  })

  test('never falls back to legacy budget thinking for adaptive-only Opus models', async () => {
    process.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING = '1'

    const opus5 = await captureRequest(
      'claude-opus-5',
      { type: 'enabled', budgetTokens: 2048 },
      'high',
    )
    expect(opus5.thinking).toBeUndefined()

    for (const model of ['claude-opus-4-8', 'claude-opus-4-7']) {
      const request = await captureRequest(
        model,
        { type: 'enabled', budgetTokens: 2048 },
        'high',
      )
      expect(request.thinking).toEqual({ type: 'adaptive' })
      expect(request.thinking).not.toHaveProperty('budget_tokens')
      expect(request.temperature).toBeUndefined()
    }
  })
})

describe('Sonnet 5 Anthropic request parameters', () => {
  test('relies on omission for default adaptive thinking and sampling', async () => {
    const request = await captureRequest(
      'claude-sonnet-5',
      { type: 'adaptive' },
      'high',
      0.2,
    )

    expect(request.thinking).toBeUndefined()
    expect(request.temperature).toBeUndefined()
  })

  test('serializes thinking disabled without capping xhigh or max effort', async () => {
    for (const effort of ['xhigh', 'max', 'ultra'] as const) {
      const request = await captureRequest(
        'claude-sonnet-5',
        { type: 'disabled' },
        effort,
        0.2,
      )

      expect(request.thinking).toEqual({ type: 'disabled' })
      expect(request.output_config?.effort).toBe(
        effort === 'ultra' ? 'max' : effort,
      )
      expect(request.temperature).toBeUndefined()
    }
  })

  test('never sends legacy budget thinking or task budgets', async () => {
    process.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING = '1'
    const request = await captureRequest(
      'claude-sonnet-5',
      { type: 'enabled', budgetTokens: 2048 },
      'max',
      undefined,
      { total: 10_000, remaining: 5_000 },
    )

    expect(request.thinking).toBeUndefined()
    expect(request.output_config).not.toHaveProperty('task_budget')
    expect(request.betas ?? []).not.toContain('task-budgets-2026-03-13')
  })
})
