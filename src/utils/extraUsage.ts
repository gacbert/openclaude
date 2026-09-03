import { isClaudeAISubscriber } from './auth.js'
import { has1mContext, modelUsesDefault1MContext } from './context.js'

export function isBilledAsExtraUsage(
  model: string | null,
  isFastMode: boolean,
  isOpus1mMerged: boolean,
): boolean {
  if (!isClaudeAISubscriber()) return false
  if (isFastMode) return true
  if (model === null || !has1mContext(model)) return false
  // Native-1M models normalize an explicit legacy suffix away at runtime and
  // must not trigger the paid extended-context label.
  if (modelUsesDefault1MContext(model)) {
    return false
  }

  const m = model
    .toLowerCase()
    .replace(/\[1m\]$/, '')
    .trim()
  // Keep these families in sync with modelSupports1M().
  const isOpus =
    m === 'opus' ||
    m.includes('opus-5') ||
    m.includes('opus-4-6') ||
    m.includes('opus-4-7') ||
    m.includes('opus-4-8')
  const isSonnet =
    m === 'sonnet' ||
    m.includes('sonnet-5') ||
    m.includes('sonnet-4-6')

  if (isOpus && isOpus1mMerged) return false

  return isOpus || isSonnet
}
