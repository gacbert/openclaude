import { expect, test } from 'bun:test'
import { vertexModelSupportsNativeWebSearch } from './claudeCapabilities.js'

test('Vertex native web search includes Claude 5 and supported Claude 4 families', () => {
  expect(vertexModelSupportsNativeWebSearch('claude-opus-5')).toBe(true)
  expect(vertexModelSupportsNativeWebSearch('CLAUDE-OPUS-5')).toBe(true)
  expect(vertexModelSupportsNativeWebSearch('claude-sonnet-5')).toBe(true)
  expect(vertexModelSupportsNativeWebSearch('CLAUDE-SONNET-5')).toBe(true)
  expect(vertexModelSupportsNativeWebSearch('claude-opus-4-8')).toBe(true)
  expect(vertexModelSupportsNativeWebSearch('claude-sonnet-4-6')).toBe(true)
  expect(vertexModelSupportsNativeWebSearch('claude-haiku-4-5')).toBe(true)
  expect(vertexModelSupportsNativeWebSearch('claude-3-7-sonnet')).toBe(false)
})
