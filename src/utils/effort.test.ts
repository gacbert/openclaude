import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../test/sharedMutationLock.js'
import * as realAuth from './auth.js'
import * as realThinking from './thinking.js'

const originalEnv = { ...process.env }

async function importFreshEffortModule() {
  return import(`./effort.ts?ts=${Date.now()}-${Math.random()}`)
}

beforeEach(async () => {
  await acquireSharedMutationLock('utils/effort.test.ts')
})

afterEach(() => {
  try {
    mock.restore()
    mock.module('./auth.js', () => realAuth)
    mock.module('./thinking.js', () => realThinking)
    process.env = { ...originalEnv }
  } finally {
    releaseSharedMutationLock()
  }
})

describe('getDefaultEffortForModel — default-Opus effort gate (#1769)', () => {
  test('Pro sessions on the default Opus (now 4.8) get medium effort', async () => {
    process.env.USER_TYPE = 'external'
    mock.module('./auth.js', () => ({
      ...realAuth,
      isProSubscriber: () => true,
      isMaxSubscriber: () => false,
      isTeamSubscriber: () => false,
    }))
    // Keep the ultrathink path out of the way so the opus branch is what's tested.
    mock.module('./thinking.js', () => ({
      ...realThinking,
      isUltrathinkEnabled: () => false,
    }))

    const { getDefaultEffortForModel } = await importFreshEffortModule()

    // Pre-fix this returned undefined because the branch only matched opus-4-6.
    expect(getDefaultEffortForModel('claude-opus-4-8')).toBe('medium')
    expect(getDefaultEffortForModel('claude-opus-4-7')).toBe('medium')
    expect(getDefaultEffortForModel('claude-opus-4-6')).toBe('medium')
    // Control: a non-default Opus does NOT get the medium default (proves the
    // result comes from the model match, not isProSubscriber alone).
    expect(getDefaultEffortForModel('claude-opus-4-1')).toBeUndefined()
    // Opus 5 keeps the API's high default rather than inheriting the legacy
    // subscriber-specific medium default.
    expect(getDefaultEffortForModel('claude-opus-5')).toBeUndefined()
    expect(getDefaultEffortForModel('claude-sonnet-5')).toBeUndefined()
  })

  test('Claude 5 preserves the API high default when legacy ultrathink is enabled', async () => {
    process.env.USER_TYPE = 'external'
    mock.module('./auth.js', () => ({
      ...realAuth,
      isProSubscriber: () => false,
      isMaxSubscriber: () => false,
      isTeamSubscriber: () => false,
    }))
    mock.module('./thinking.js', () => ({
      ...realThinking,
      isUltrathinkEnabled: () => true,
    }))

    const { getDefaultEffortForModel } = await importFreshEffortModule()

    expect(getDefaultEffortForModel('claude-opus-5')).toBeUndefined()
    expect(getDefaultEffortForModel('claude-sonnet-5')).toBeUndefined()
    expect(getDefaultEffortForModel('claude-opus-4-8')).toBe('medium')
  })
})
