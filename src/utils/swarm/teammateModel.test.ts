import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../../test/sharedMutationLock.js'

beforeEach(async () => {
  await acquireSharedMutationLock('utils/swarm/teammateModel.test.ts')
})

afterEach(() => {
  try {
    mock.restore()
  } finally {
    releaseSharedMutationLock()
  }
})

async function importFreshTeammateModelModule(defaultOpusModel: string) {
  mock.module('../model/model.js', () => ({
    getDefaultOpusModel: () => defaultOpusModel,
  }))
  const nonce = `${Date.now()}-${Math.random()}`
  return import(`./teammateModel.js?ts=${nonce}`)
}

test('getHardcodedTeammateModelFallback returns a Mistral fallback in mistral mode', async () => {
  const { getHardcodedTeammateModelFallback } =
    await importFreshTeammateModelModule('devstral-latest')

  expect(getHardcodedTeammateModelFallback()).toBe('devstral-latest')
})

test('getHardcodedTeammateModelFallback returns the current default Opus (5) for first party', async () => {
  // Regression for #1769: the fallback hardcoded Opus 4.6 while the default Opus
  // is now Opus 5, so new teammates spawned on an older model.
  const { getHardcodedTeammateModelFallback } =
    await importFreshTeammateModelModule('claude-opus-5')

  expect(getHardcodedTeammateModelFallback()).toBe('claude-opus-5')
})

test('getHardcodedTeammateModelFallback preserves the provider-aware model ID', async () => {
  const { getHardcodedTeammateModelFallback } =
    await importFreshTeammateModelModule('us.anthropic.claude-opus-5')

  expect(getHardcodedTeammateModelFallback()).toBe(
    'us.anthropic.claude-opus-5',
  )
})
