import { expect, test } from 'bun:test'
import { __test } from './sideQuery.js'

test('Sonnet 5 side queries never send manual thinking budgets or sampling', () => {
  expect(
    __test.getSideQueryReasoningParams(
      'claude-sonnet-5',
      4096,
      8192,
      0.2,
    ),
  ).toEqual({ thinking: { type: 'adaptive' } })

  expect(
    __test.getSideQueryReasoningParams(
      'claude-sonnet-5',
      false,
      8192,
      0.2,
    ),
  ).toEqual({ thinking: { type: 'disabled' } })

  expect(
    __test.getSideQueryReasoningParams(
      'claude-sonnet-5',
      undefined,
      8192,
      0.2,
    ),
  ).toEqual({})
})

test('legacy Sonnet side queries retain manual thinking and temperature', () => {
  expect(
    __test.getSideQueryReasoningParams(
      'claude-sonnet-4-6',
      4096,
      8192,
      0.2,
    ),
  ).toEqual({
    temperature: 0.2,
    thinking: { type: 'enabled', budget_tokens: 4096 },
  })
})
