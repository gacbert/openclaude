import { describe, expect, test } from 'bun:test'

import {
  analyzeContinuationIntent,
  CONTINUATION_NUDGE_MESSAGE,
} from './continuation.js'
import { getBudgetContinuationMessage } from './tokenBudget.js'

describe('continuation turn scope', () => {
  test('does not continue a completed citation answer because it contains a bare gerund', () => {
    const answer = `This may be a viable route for generating preliminary data instead of sorting directly from primary tissue.

Fitzner et al. (2020). Cell-type- and brain-region-resolved mouse brain lipidome. https://doi.org/10.1016/j.celrep.2020.108132`

    expect(analyzeContinuationIntent(answer)).toEqual({ shouldNudge: false })
  })

  test('does not continue a completed draft answer ending in a typographic quote', () => {
    const answer =
      'I drafted the email using your framing. Fixed “Neil” to “Neill.”'

    expect(analyzeContinuationIntent(answer)).toEqual({ shouldNudge: false })
  })

  test('does not continue a completed answer ending in a closed code block', () => {
    const answer = `Here is the draft:

\`\`\`
Hi Melissa,

Thanks so much for the fund code.
\`\`\``

    expect(analyzeContinuationIntent(answer)).toEqual({ shouldNudge: false })
  })

  test('still continues an answer truncated inside an open code block', () => {
    const answer = `Here is the draft:

\`\`\`
Hi Melissa,`

    expect(analyzeContinuationIntent(answer)).toEqual({
      shouldNudge: true,
      reason: 'possible_truncation',
    })
  })

  test('does not continue a coaching sign-off that tells the USER to go do something', () => {
    // Real chief-of-staff reply (2026-07-22) that was nudged: the assistant
    // had fully answered, the nudge fired, and its "you're all set" follow-up
    // replaced the answer in Telegram.
    const answer =
      'The through-line: guard the few, ignore the many. Your instinct is to fill and optimize broadly, but your life pays off narrowly. Now go finish Section 3, that’s a head task, not a tail one.'

    expect(analyzeContinuationIntent(answer)).toEqual({ shouldNudge: false })
  })

  test('bare "now go" is user-directed, not agent intent', () => {
    expect(analyzeContinuationIntent('Go write.')).toEqual({ shouldNudge: false })
    expect(
      analyzeContinuationIntent('Now go check the dashboard when you get a minute.'),
    ).toEqual({ shouldNudge: false })
  })

  test('still continues on first-person intent, including "go"', () => {
    // Dropping "go" from the subject-less pattern must not weaken the
    // subject-bearing ones this heuristic actually exists for.
    expect(
      analyzeContinuationIntent('Now I will go check the logs.'),
    ).toEqual({ shouldNudge: true, reason: 'continuation_signal' })
    expect(analyzeContinuationIntent('Now create the component.')).toEqual({
      shouldNudge: true,
      reason: 'continuation_signal',
    })
  })

  test('still recognizes an explicit present-progressive transition', () => {
    expect(
      analyzeContinuationIntent('The first step is complete. Now generating the report.'),
    ).toEqual({
      shouldNudge: true,
      reason: 'continuation_signal',
    })
  })

  test('synthetic continuations cannot reactivate an earlier automation', () => {
    expect(CONTINUATION_NUDGE_MESSAGE).toContain(
      "current user's latest request only",
    )
    expect(CONTINUATION_NUDGE_MESSAGE).toContain(
      'Do not resume any earlier task, automation, or objective',
    )

    const budgetNudge = getBudgetContinuationMessage(1, 565, 500_000)
    expect(budgetNudge).toContain("current user's latest request")
    expect(budgetNudge).toContain(
      'do not summarize or resume any earlier task, automation, or objective',
    )
  })
})
