import { expect, test } from 'bun:test'
import { mapAppliedEffortToShim } from './client.js'

test('Claude 5 keeps xhigh and max distinct across the OpenAI shim boundary', () => {
  expect(mapAppliedEffortToShim('claude-sonnet-5', 'xhigh')).toBe('xhigh')
  expect(mapAppliedEffortToShim('claude-sonnet-5', 'max')).toBe('max')
  expect(mapAppliedEffortToShim('opencode-claude-sonnet-5', 'max')).toBe('max')
  expect(mapAppliedEffortToShim('claude-sonnet-5', 'ultra')).toBe('max')

  // OpenAI-compatible models retain the established standard max -> xhigh map.
  expect(mapAppliedEffortToShim('gpt-5.6-sol', 'max')).toBe('xhigh')
})
