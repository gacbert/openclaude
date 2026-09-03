/** Models supported by Vertex's native Claude web-search tool. */
export function vertexModelSupportsNativeWebSearch(model: string): boolean {
  const normalized = model.toLowerCase()
  return (
    normalized.includes('claude-opus-5') ||
    normalized.includes('claude-sonnet-5') ||
    normalized.includes('claude-opus-4') ||
    normalized.includes('claude-sonnet-4') ||
    normalized.includes('claude-haiku-4')
  )
}
