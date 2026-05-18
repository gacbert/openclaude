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

## Intentionally Not Carried Forward

- No `OPENCLAUDE_CODEX_SERVICE_TIER=fast`; the backend rejected it with
  `400 Unsupported service_tier: fast`.
- No blanket context-window clamp. Upstream `gpt-5.5 = 272000` is kept, and
  `gpt-5.4 = 1050000` is allowed only after validation confirms the served
  model is truly `gpt-5.4`.

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
