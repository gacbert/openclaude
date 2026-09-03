# Gacbert OpenClaude Runtime Patches

This fork carries the small runtime fixes required by Bert's Telegram life OS.

## Patch Set

- Headless requested-model routing: non-interactive `--model gpt-5.4` must seed
  `mainLoopModel` and `mainLoopModelForSession`, otherwise the session can
  report `system.init.model = gpt-5.4` while running the assistant on `gpt-5.5`.
- GPT-5.6 Codex catalog: Sol, Terra, and Luna are registered across model
  descriptors, brand/catalog artifacts, provider aliases, picker options, and
  SDK types. The Codex route uses upstream's conservative 272,000-token input
  boundary and 128,000 max output; direct OpenAI keeps its 1.05M catalog
  window. Sol defaults to low effort; Terra and Luna default to medium.
- Terra default: Codex aliases, `codexplan`, provider recommendations, and
  direct OpenAI/Codex defaults resolve to `gpt-5.6-terra` instead of GPT-5.5.
- Ultra is a distinct internal mode. Ordinary `max` serializes as `xhigh`;
  only internal `ultra` serializes as Codex wire effort `max`. A root Ultra
  turn receives a concise proactive Agent-tool delegation prompt, while child
  agents inherit ordinary max so coordinators do not recurse. The headless CLI
  parser accepts hidden `--effort ultra` for orchestrator/SDK callers while
  omitting it from ordinary help text. Upstream's separate `ultracode` mode
  remains available unchanged.
- Codex-compatible request identity: Codex response calls use
  `originator: "codex_cli_rs"` and `User-Agent: "codex_cli_rs/0.21.0"`.
- Related Codex usage, web search, and cache probe requests use
  `originator: "codex_cli_rs"`.
- Manual Spark support: `gpt-5.3-codex-spark` has explicit conservative
  metadata (`128000` context, `32000` max output) so OpenClaude does not fall
  back to unknown-model compaction when Telegram explicitly selects `/spark`.
- Spark streamed tool-call arguments: the Codex SSE parser
  (`src/services/api/codexShim.ts`) now recovers function-call `arguments`
  delivered on `response.function_call_arguments.done` / `response.output_item.done`
  in addition to `response.function_call_arguments.delta`. `gpt-5.3-codex-spark`
  sends the full arguments on the completed item rather than as deltas, so
  without this every spark tool call arrived with empty input (`{}`). Guarded by
  a per-block `argsStreamed` flag so delta-streaming models (gpt-5.5) are not
  double-appended. Covered by streaming regression tests in `codexShim.test.ts`.
- Sol Ultra terminal text: the Codex SSE parser recovers finalized assistant
  text from `response.output_text.done` and `response.output_item.done` when a
  model omits `response.output_text.delta`. It appends only the suffix missing
  from streamed deltas, so ordinary responses are not duplicated. This prevents
  a completed Sol Ultra answer from becoming an empty Anthropic assistant turn.
- Opus 5 launch: registered `opus50` / `claude-opus-5` across the legacy model
  table, Claude descriptor, first-party brand, Bedrock, Vertex, model picker,
  attribution, migration notices, SDK-facing bundled API metadata, and model
  fallbacks. The `opus` alias now resolves to Opus 5 on first-party, Bedrock,
  and Vertex; Foundry remains on its built-in Opus 4.6 alias and custom
  Anthropic-compatible gateways remain conservatively pinned to Opus 4.7.
- Opus 5 request semantics: adaptive thinking is the enabled default; an
  explicit disabled setting is serialized as `{type: "disabled"}` instead of
  being omitted. On Opus 5, disabled thinking caps `xhigh`/`max` wire effort at
  `high`; earlier Opus releases keep effort independent from thinking. Legacy
  budget thinking is never sent to adaptive-only Opus releases, and sampling
  temperature is omitted for Opus 5/4.8/4.7.
- Opus 5 limits and pricing: first-party Opus 5 uses its native 1M context
  without a redundant `[1m]` beta/variant, with 64k default and 128k maximum
  output. Traditional Bedrock/Vertex keep the explicit `[1m]` compatibility
  path. Standard pricing is $5/$25 per million tokens; first-party Fast mode is
  restricted to Opus 5 and 4.8 at $10/$50 rather than the retired $30/$150
  tier. Opus 4.7/4.8 remain compatibility targets for existing configurations
  but are not shown as selectable model-picker options.
- Sonnet 5 launch: the direct first-party `sonnet` alias now resolves to
  `claude-sonnet-5`; `sonnet[1m]` normalizes to the same model because the 1M
  window is native. Built-in Bedrock/Vertex/Foundry aliases remain on their
  provider-specific Sonnet 4.5 defaults, while custom Claude Platform-style
  gateways retain Sonnet 4.6 unless explicitly pinned to Sonnet 5.
- Sonnet 5 request semantics and limits: adaptive thinking is enabled by
  omission, explicit disable remains `{type: "disabled"}`, and the full
  low/medium/high/xhigh/max effort range is preserved even when thinking is
  disabled. Manual thinking budgets, non-default sampling, task budgets, Fast
  mode, and Priority Tier are not sent. Context/output limits are 1M and
  64k/128k; token-count fallbacks use a conservative 2.7 bytes/token ratio.
- Sonnet 5 pricing: launch pricing is $2/$10 per million tokens through August
  31, 2026, then resolves dynamically to $3/$15 starting September 1. Cache
  write/read prices switch at the same boundary, including in long-lived smart
  routing processes.
- Codex Fast speed tier (opt-in): `OPENCLAUDE_CODEX_SERVICE_TIER`, when set to
  `priority` (or a truthy flag `1`/`true`/`yes`/`on`, treated as `priority`),
  attaches `service_tier: "priority"` to Codex `/responses` requests. The
  ChatGPT Codex backend's model catalog exposes this tier (UI name "Fast",
  ~1.5x speed, increased usage) for GPT-5.6 plus legacy `gpt-5.5` / `gpt-5.4`,
  so it is gated by `supportsCodexServiceTier()` (`providerConfig.ts`) — spark, mini,
  `gpt-5.3-codex` and `gpt-5.2` never receive it. Resolved in
  `resolveProviderRequest()` onto `ResolvedProviderRequest.serviceTier` and
  injected in `codexShim.ts` alongside `reasoning`. Default unset = no change.
  Covered by `providerConfig.serviceTier.test.ts`.
- Continuation nudge — closing code fence is not truncation
  (`utils/continuation.ts`): `UNFINISHED_SENTIMENT_SIGNALS` carried a
  ```` /```[a-z]*\s*$/ ```` "unclosed code block starter" needle, but that
  pattern matches the *closing* fence of a complete block just as readily.
  Any answer ending in a fenced block was therefore classified as
  `possible_truncation` — a structural signal that deliberately overrides
  completion markers — so `query.ts` injected a continuation nudge and
  re-queried. The model, already done, replied with a meta message
  ("that last answer was complete"), and since the bot delivers the CLI's
  final result string, that meta reply *replaced* the real answer in Telegram.
  Fence truncation is already decided correctly by the ``` parity check in
  `analyzeContinuationIntent`, so the redundant needle is removed. Measured
  against 80 real double-response events in the bot's transcripts: 41 were
  this false positive (15 of the last 19); after the fix, 0 of the last 19
  nudge, while the 5 genuine intent signals still do. Covered by
  `continuation.turnScope.test.ts`.
- Continuation nudge — "now go" is user-directed, not agent intent
  (`utils/continuation.ts`): the subject-less imperative signal
  `\bnow (<verbs>)\b` fired on "Now go finish Section 3", a
  chief-of-staff sign-off telling *Bert* to go do something. The heuristic
  exists to catch an agent that announces its own next step and then stops
  without calling a tool; bare "now go <verb>" is only ever addressed to a
  person, since self-narration takes the first-person form ("now I'll go
  check the logs") already covered by the `now i('ll| will)` signal. A new
  `VERB_ALT_IMPERATIVE` drops `go` from the two subject-less patterns only,
  leaving `VERB_ALT` intact for every subject-bearing one. Replaying real
  transcripts: 0/314 final assistant messages since Jul 18 now nudge (this
  was the last one), and first-person intent still nudges. Note an
  unrelated pre-existing gap left alone: `strongIntent` matches "i will"
  but not the contraction "i'll", so "Now I'll check the logs." does not
  nudge — true before this change too.

## Intentionally Not Carried Forward

- No literal `OPENCLAUDE_CODEX_SERVICE_TIER=fast`; the backend rejects the
  literal value `fast` with `400 Unsupported service_tier: fast`. The valid
  Fast-tier value is `priority` (the catalog's UI display name for it is
  "Fast"), now supported via the opt-in patch above.
- No direct-API 1.05M value leaks into the GPT-5.6 Codex route. Upstream v0.25's
  route-aware accounting keeps Codex at the conservative 272,000 boundary and
  direct OpenAI at 1.05M. Legacy GPT-5.5 keeps its conservative window.
- No blanket return to Spark. Telegram may select Spark manually, and routine
  Calendar/Notion agents retain Spark frontmatter; capable defaults and old
  GPT-5.5 aliases now resolve to Terra.
- No Superpowers bootstrap/prompt injection. The old untracked prompt bundle
  was deliberately excluded while replaying the local checkpoint.

## Validation

Build with:

```bash
bun run build:gacbert
```

Run the focused model/effort checks:

```bash
bun run integrations:check
bun run typecheck
bun test src/utils/effort.codex.test.ts src/utils/effort.test.ts src/utils/thinking.test.ts src/utils/fastMode.test.ts src/utils/modelCost.modelGate.test.ts src/services/api/providerConfig.serviceTier.test.ts src/services/api/codexShim.test.ts src/services/api/claude.opus5Request.test.ts src/services/api/client.sonnet5Effort.test.ts src/services/tokenEstimation.test.ts src/utils/sideQuery.test.ts src/services/compact/autoCompact.test.ts src/utils/context.test.ts src/utils/betas.test.ts src/utils/extraUsage.test.ts
```

Expected:

- `codexplan` and unspecified Codex defaults resolve to `gpt-5.6-terra`.
- Sol/Terra/Luna report 272,000 context on Codex and 1.05M on direct OpenAI.
- Standard max maps to wire `xhigh`; internal Ultra maps to wire `max` and
  injects delegation guidance only on the root turn.
- Terminal-only Sol text is recovered once without duplicating streamed deltas.
- Fast remains unset by default and sends `priority` only when explicitly set.
- Opus aliases follow the provider table above, native first-party 1M does not
  emit the legacy beta, and disabled thinking remains disabled on the wire.
- Opus 5 defaults to high effort; Fast mode prices Opus 5/4.8 at $10/$50 and
  rejects older Opus releases.
- Direct first-party `sonnet` resolves to Sonnet 5 with native 1M context;
  default requests omit thinking/sampling, explicit disable remains disabled,
  and xhigh/max stay distinct on Anthropic-shaped shim routes.

## v0.30.0-gacbert.1 (2026-09-03)

Merge of upstream `v0.30.0` (98 commits, v0.26.0 through v0.30.0) preserving the
full patch set. 18 files conflicted; typecheck is clean afterwards (better than
the pre-merge baseline, which carried two `permissions.test.ts` errors upstream
has since fixed).

Conflicts of substance, and how they were resolved:

- **`#2051` codexplan default (v0.28.0).** Upstream moved `codexplan` to GPT-5.6
  Sol. This fork keeps **Terra**, in `utils/model/configs.ts` (15 `codex:` keys,
  including upstream's newly-added blocks), `utils/model/model.ts` (4
  `OPENAI_MODEL ||` defaults plus the `codexplan (...)` label), and
  `services/api/providerConfig.ts`. The bare `gpt-5.6` alias still resolves to
  the flagship tier, which is upstream's convention and unrelated to the default.
- **`#2148` effort exclusions (v0.30.0).** Upstream restructured
  `legacyModelSupportsEffort` behind a `nativeTransport === 'anthropic'` guard and
  added a `context` parameter to `legacyModelSupportsMaxEffort`. Took the
  restructure; re-added `claude-opus-5`, `claude-sonnet-5`, and `claude-fable` to
  the allowlists. `'ultra'` survives in `EFFORT_LEVELS`, its label, and the
  `ultra -> max` wire mapping.
- **`#2147` attribution scoping (v0.30.0).** Took upstream's deferred
  `attributionEnabled` / `applyAnthropicAttributionPolicy` flow and kept the
  fork's `ultraSystemPrompt` spread inside the system array, plus its
  `retryModel` request-model refactor (which subsumes upstream's
  `providerRequestModel`, since `clientOptions.model` is seeded from it).
- **openaiShim split.** Upstream split `services/api/openaiShim.ts` into ~20
  modules and deleted the region holding the fork's
  `getAnthropicMessagesReasoningFields`. It is **re-homed into
  `services/api/openaiShim/requestPlanner.ts`**, replacing upstream's inline
  `isAdaptive` block, and re-exported through `openaiShim.ts`'s `__test` surface.
  Fable joins Claude 5 in its adaptive set. `ShimRequestParams` gained a
  `thinking` field, which the request genuinely carries at runtime.
- **`#2064`/`#2131` model cost.** Took upstream's prototype-member guard and
  custom-pricing overrides; re-inserted the fork's time-limited Sonnet 5 tier and
  removed the now-duplicate `getKnownModelCosts`. That function is **exported with
  an optional `usage`** so the fork's `smartRouting` one-arg call still compiles.
  A custom override cannot express this fork's 1-hour cache-write field, so it is
  derived as 1.6x the 5-minute rate (Anthropic's standard ratio).
- Two upstream relocations left duplicated blocks behind that only the type
  checker caught: `recordPromptState` (referenced an out-of-scope `system`) and
  the `logAPIQuery` scalars. Both fork copies were dropped and the fork's one real
  improvement — a `logThinkingType` that reports `adaptive` instead of mislabeling
  adaptive turns `disabled` — was re-applied at upstream's new location.

Absorbed from upstream, previously fork-only concerns: nothing in the Claude
catalog. Upstream v0.30.0 still ships **no** `claude-opus-5`, `claude-sonnet-5`,
or `claude-fable-*` first-party entries, and its `modelSupports1M()` still stops
at Opus 4.8 — so `modelUsesDefault1MContext` and the whole Claude 5 / Fable
surface remain fork-only. `utils/schemaSanitizer.ts` is byte-identical to v0.25.0,
so the claude.ai connector top-level-`anyOf` 400 is **not** fixed upstream and
`ENABLE_CLAUDEAI_MCP_SERVERS=false` must stay.

Test posture: the full Bun suite goes 60 -> 66 failures, but the merge **fixes 34**
and adds 40. Of the 40, 20 are upstream's brand-new `src/memdir/autoExtractFacts`
tests — that directory is byte-identical to v0.30.0 and fails in isolation, so it
is upstream's own breakage, not a merge artifact. The other 20 all pass in
isolation and are the suite's documented order-dependence (global mock and cwd
leakage). Two upstream cost tests were adapted to this fork's six-field
`ModelCosts`.

## v0.25.0-gacbert.4 (2026-09-03)

First-party support for Claude Fable 5 and 5.1. The CLI ships no Fable entry
for the anthropic route, and an unlisted first-party id degrades *silently*
rather than erroring, so a Fable turn was running at: a 200k context window
(the `MODEL_CONTEXT_WINDOW_DEFAULT` fallback, compacting ~5x early), a 32k
output default with a 64k ceiling, effort clamped to `high` (an id outside the
xhigh/max allowlists loses both), budget-based thinking on `count_tokens`
(a 400 the caller happens to swallow), no structured-outputs beta header, and
`$5/$25` pricing against a `$10/$50` model.

Every gate keys on the canonical name `claude-fable`, which both
`claude-fable-5` and `claude-fable-5-1` collapse to via the
`firstPartyNameToCanonical` regex fallback, so one entry serves both:

- `utils/context.ts` — `modelUsesDefault1MContext` (native 1M, and therefore
  no `context-1m-2025-08-07` beta header) and the 128k `getModelMaxOutputTokens`
  branch.
- `utils/effort.ts` — `legacyModelSupportsMaxEffort` and
  `legacyModelSupportsXHighEffort`.
- `utils/thinking.ts` — `modelOnlySupportsAdaptiveThinking`. Deliberately NOT
  `modelDefaultsToAdaptiveThinking`: that gate is what lets
  `--max-thinking-tokens 0` emit `thinking:{type:'disabled'}`, which Fable
  rejects with a 400. Adaptive-only, never default-adaptive.
- `utils/betas.ts` — `modelSupportsStructuredOutputs`, first-party only.
- `utils/modelCost.ts` — a `claude-fable` key at `COST_TIER_10_50`. Note that
  tier's cache-read rate ($1.00/Mtok) is higher than Fable 5.1's published
  $0.25, so cache reads over-report; input/output are exact.
- `utils/model/model.ts` — `Fable 5.1` / `Fable 5` display names.
- `integrations/models/claude.ts` — a catalog entry for honesty only; the
  anthropic-native transport short-circuits before the integration catalog is
  consulted, so it is not load-bearing.

Ultracode is unchanged: Fable still gets no standing multi-agent grant, and
`--effort ultracode` lands on the ordinary ceiling.

New coverage in `src/utils/fable.gacbert.test.ts` (9 tests) — each one fails
against the unpatched tree, which is how the degradation above was measured.

Post-build guards were extended in the same commit, both for the new Fable
gates and for five older patches that had none: `modelUsesDefault1MContext`,
the Spark catalog entry, the `VERB_ALT_IMPERATIVE` "now go" fix, the
turn-scoped `CONTINUATION_NUDGE_MESSAGE`, the Terra codexplan default (with
`requireAbsent` needles for upstream #2051's Sol flip), and
`getAnthropicMessagesReasoningFields` (which upstream v0.30.0's openaiShim
split will require re-homing). Every guard was negative-tested by mutating the
built bundle and confirming it throws.

## v0.25.0-gacbert.3 (2026-07-26)

Adds the Sonnet 5 launch behavior described above without changing the running
process. It also updates provider catalogs and examples, knowledge cutoff and
Vertex region metadata, migration notices, generated integration artifacts,
and post-build guards. Existing explicit Sonnet 4.x pins remain valid, and the
model picker continues to hide Opus 4.7/4.8 compatibility entries.

## v0.25.0-gacbert.2 (2026-07-26)

Merged the stable upstream `v0.25.0` release while preserving the fork's
Telegram/runtime behavior. This brings in upstream GPT-5.6 routing, Responses
API integration work, smart routing, `ultracode`, configurable compaction and
tool-history compression, long-session fixes, and interrupt/resume fixes. The
12 commits currently on unreleased upstream `main` were reviewed but not mixed
into this stable update.

This revision also adds the public Opus 5 launch behavior described above.
Private prompt-bundle switches and automatic cyber-refusal fallback are not
recreated; Opus 4.8 remains available internally as the compatibility fallback
target but is not shown in the model picker.

## v0.21.0-gacbert.2 (2026-07-09)

This revision adds the GPT-5.6 catalog/defaults and isolated Ultra semantics
described above. The post-build guard now checks all three model ids, ordinary
`max -> xhigh`, `ultra -> max`, the root delegation prompt, and child fallback
to ordinary max. The matching Telegram bot dependency and lockfile must point
to the `.2` tarball; do not mix this source tree with the older `.1` package.

The full Bun suite has 30 known order-dependent failures on the unchanged
`e6cecef1` baseline due to global mock and current-working-directory leakage.
Changed-area tests pass in isolation; compare any aggregate failure set to the
baseline before assigning it to this patch.

## v0.21.0 merge (2026-07-01)

Merged upstream `v0.21.0` (from 0.15.0 base). Per-patch status after the merge:

- **ABSORBED upstream** (no longer fork-only; keep no local delta):
  - Spark streamed tool-call arguments — upstream `codexShim.ts` now carries
    the same recovery logic verbatim (upstream #1259).
  - Opus 4.8 catalog/alias — upstream added `opus48` config, catalog entry
    (with a better 128k max-output), `getDefaultOpusModel()` default, and
    labels (upstream #1769). The fork's duplicate lower-output
    `claude-opus-4-8` catalog entry was removed during conflict resolution.
- **STILL FORK-ONLY** (re-verified in the merged build by the post-build
  guard):
  - Headless requested-model routing (`main.tsx` seeding).
  - Codex request identity (`codex_cli_rs` originator/User-Agent in shim,
    usage, web search, cache probe).
  - Spark catalog metadata in `integrations/models/gpt.ts` (upstream still
    has no first-party spark entry).
  - Opus 4.8 default-1M context accounting (`modelUsesDefault1MContext` in
    `utils/context.ts`) — upstream still gates 1M behind the `[1m]` suffix /
    beta header.
  - Codex Fast tier (`OPENCLAUDE_CODEX_SERVICE_TIER` → `service_tier:
    "priority"`).
- **Guard script**: needles converted to whitespace-tolerant regexes — the
  0.21.0 build minifies assignment/property spacing, which the old literal
  strings predated. Same assertions, format-proof.
- Fable note: upstream supports `claude-fable-5` only via the opencode
  gateway; the first-party route still needs the bot-side
  `claude-fable-5[1m]` alias for the 1M window.
