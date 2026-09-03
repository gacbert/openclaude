import { describe, expect, test } from 'bun:test'

import { query } from '../query.js'
import { getDefaultAppState, type AppState } from '../state/AppStateStore.js'
import { createUserMessage } from '../utils/messages.js'
import { asSystemPrompt } from '../utils/systemPromptType.js'
import { CONTINUATION_NUDGE_MESSAGE } from '../utils/continuation.js'

function assistant(uuid: string, text: string) {
  return {
    type: 'assistant',
    uuid,
    message: {
      id: uuid,
      type: 'message',
      role: 'assistant',
      model: 'test-model',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      content: [{ type: 'text', text }],
    },
  }
}

function makeToolUseContext(appStateRef: { current: AppState }) {
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'sonnet',
      tools: [],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: [], allAgents: [] },
    },
    abortController: new AbortController(),
    readFileState: new Map(),
    getAppState: () => appStateRef.current,
    setAppState: (updater: (prev: AppState) => AppState) => {
      appStateRef.current = updater(appStateRef.current)
    },
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  } as any
}

async function runQuery(responses: string[]) {
  const appStateRef = { current: getDefaultAppState() }
  const yielded: any[] = []
  const modelRequestMessages: any[][] = []
  let modelCalls = 0
  const generator = query({
    messages: [
      createUserMessage({
        content: 'Inspect the uploaded Fitzner paper and answer my correction.',
      }),
    ],
    systemPrompt: asSystemPrompt([]),
    userContext: {},
    systemContext: {},
    canUseTool: async () => ({ behavior: 'allow' }),
    toolUseContext: makeToolUseContext(appStateRef),
    querySource: 'sdk',
    deps: {
      uuid: () => `uuid-${modelCalls}`,
      microcompact: async messages => ({ messages }),
      autocompact: async () => ({ wasCompacted: false }),
      stopHookExecutionDeps: {
        executeStopHooks: async function* () {},
        isTeammate: () => false,
      },
      callModel: async function* ({ messages }: any) {
        modelRequestMessages.push(messages)
        const text = responses[modelCalls]!
        modelCalls++
        yield assistant(`assistant-${modelCalls}`, text)
      },
    } as any,
  })

  while (true) {
    const next = await generator.next()
    if (next.done) {
      return {
        terminal: next.value,
        yielded,
        modelCalls,
        modelRequestMessages,
      }
    }
    yielded.push(next.value)
  }
}

describe('query continuation turn scope', () => {
  test('a completed citation answer does not silently start a second model turn', async () => {
    const answer = `This may be a viable route for generating preliminary data instead of sorting directly from primary tissue.

Fitzner et al. (2020). Cell-type- and brain-region-resolved mouse brain lipidome. https://doi.org/10.1016/j.celrep.2020.108132`
    const result = await runQuery([answer])

    expect(result.terminal.reason).toBe('completed')
    expect(result.modelCalls).toBe(1)
  })

  test('a real continuation is scoped and persisted before the next model turn', async () => {
    const result = await runQuery([
      'The first step is complete. Now generating the report.',
      'The report is complete.',
    ])

    expect(result.modelCalls).toBe(2)
    const persistedNudges = result.yielded.filter(
      message =>
        message.type === 'user' &&
        message.isMeta === true &&
        message.message.content === CONTINUATION_NUDGE_MESSAGE,
    )
    expect(persistedNudges).toHaveLength(1)
    expect(result.modelRequestMessages[1]).toContain(persistedNudges[0])
  })
})
