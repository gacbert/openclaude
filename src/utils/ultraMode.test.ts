import { expect, test } from 'bun:test'

import {
  getUltraSystemPrompt,
  resolveChildEffort,
} from './ultraMode.js'

test('Ultra prompt is injected only for a root Ultra turn', () => {
  expect(getUltraSystemPrompt('ultra', false)).toContain(
    'Proactive multi-agent delegation is active',
  )
  expect(getUltraSystemPrompt('max', false)).toBeUndefined()
  expect(getUltraSystemPrompt('ultra', true)).toBeUndefined()
})

test('children do not recursively inherit Ultra mode', () => {
  expect(resolveChildEffort(undefined, 'ultra')).toBe('max')
  expect(resolveChildEffort('low', 'ultra')).toBe('low')
  expect(resolveChildEffort(undefined, 'high')).toBe('high')
})
