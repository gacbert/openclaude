# Gacbert OpenClaude Runtime Patches

This fork carries the small runtime fixes required by Bert's Telegram life OS.

## Patch Set

- Headless requested-model routing: non-interactive `--model gpt-5.4` must seed
  `mainLoopModel` and `mainLoopModelForSession`, otherwise the session can
  report `system.init.model = gpt-5.4` while running the assistant on `gpt-5.5`.
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
- Opus 4.8 catalog: registered `opus48` / `claude-opus-4-8`
  (`configs.ts`, `integrations/models/claude.ts`) and bumped the firstParty
  `getDefaultOpusModel()` default + display/labels (`utils/model/model.ts`,
  `constants/prompts.ts`) so the bare `opus` alias resolves to Opus 4.8.
- Opus 4.8 context accounting: `claude-opus-4-8` is treated as a default
  1M-context model for local `/context` and auto-compact thresholds, preventing
  early compaction at the generic 200k Claude fallback.
- Codex Fast speed tier (opt-in): `OPENCLAUDE_CODEX_SERVICE_TIER`, when set to
  `priority` (or a truthy flag `1`/`true`/`yes`/`on`, treated as `priority`),
  attaches `service_tier: "priority"` to Codex `/responses` requests. The
  ChatGPT Codex backend's model catalog exposes this tier (UI name "Fast",
  ~1.5x speed, increased usage) for `gpt-5.5` / `gpt-5.4` only, so it is gated
  by `supportsCodexServiceTier()` (`providerConfig.ts`) — spark, mini,
  `gpt-5.3-codex` and `gpt-5.2` never receive it. Resolved in
  `resolveProviderRequest()` onto `ResolvedProviderRequest.serviceTier` and
  injected in `codexShim.ts` alongside `reasoning`. Default unset = no change.
  Covered by `providerConfig.serviceTier.test.ts`.

## Intentionally Not Carried Forward

- No literal `OPENCLAUDE_CODEX_SERVICE_TIER=fast`; the backend rejects the
  literal value `fast` with `400 Unsupported service_tier: fast`. The valid
  Fast-tier value is `priority` (the catalog's UI display name for it is
  "Fast"), now supported via the opt-in patch above.
- No blanket context-window clamp. Upstream `gpt-5.5 = 272000` is kept, and
  `gpt-5.4 = 1050000` is allowed only after validation confirms the served
  model is truly `gpt-5.4`.
- No blanket return to Spark. Telegram may select Spark manually, but legacy
  agent and automation aliases remain on `gpt-5.5` unless explicitly changed.

## Validation

Build with:

```bash
bun run build:gacbert
```

Then probe both models:

```bash
node dist/cli.mjs --provider openai --model gpt-5.4 --print --verbose --output-format stream-json --no-session-persistence --input-format text -p 'Return exactly: OK'
node dist/cli.mjs --provider openai --model gpt-5.5 --print --verbose --output-format stream-json --no-session-persistence --input-format text -p 'Return exactly: OK'
```

Expected:

- `gpt-5.4` reports both `system.init.model` and assistant usage as `gpt-5.4`.
- `gpt-5.5` reports both `system.init.model` and assistant usage as `gpt-5.5`.
- `gpt-5.5` context remains around `272000`.
