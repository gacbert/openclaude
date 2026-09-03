import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const cliPath = join(process.cwd(), 'dist', 'cli.mjs')
let content = readFileSync(cliPath, 'utf8')

function countMatches(search: RegExp) {
  return (content.match(search) ?? []).length
}

function requireMatches(label: string, needle: RegExp) {
  if (!needle.test(content)) {
    throw new Error(`${label}: missing expected output`)
  }
}

function requireAbsent(label: string, needle: RegExp) {
  if (needle.test(content)) {
    throw new Error(`${label}: removed pattern reappeared in bundled output`)
  }
}

// These should be generated from source patches. Keep this as a post-build
// guard so bundled output cannot silently lose Bert's Codex runtime fixes.
// Needles are whitespace-tolerant regexes because production builds minify
// property and assignment spacing (`a:b??c`).
requireMatches(
  'headless model routing',
  /mainLoopModel:\s*effectiveModel\s*\?\?\s*defaultState\.mainLoopModel/,
)
requireMatches(
  'headless model-for-session routing',
  /mainLoopModelForSession:\s*effectiveModel\s*\?\?\s*defaultState\.mainLoopModelForSession/,
)
requireMatches(
  'codex responses originator',
  /headers\.originator\s*=\s*"codex_cli_rs"/,
)
requireMatches(
  'codex responses user agent',
  /headers\["User-Agent"\]\s*=\s*"codex_cli_rs\/[0-9][0-9.]*"/,
)
requireMatches('codex service tier env flag', /OPENCLAUDE_CODEX_SERVICE_TIER/)
// A trailing fence matches the CLOSING fence of a complete block, so treating
// it as a truncation signal nudges every answer that ends in a code block.
// Parity of ``` already decides real truncation. An upstream merge that
// restores this needle silently resurrects the bogus meta-reply turns.
requireAbsent(
  'continuation trailing-fence truncation needle',
  /\/```\[a-z\]\*\\s\*\$\/i/,
)
requireMatches('GPT-5.6 Sol catalog', /gpt-5\.6-sol/)
requireMatches('GPT-5.6 Terra catalog', /gpt-5\.6-terra/)
requireMatches('GPT-5.6 Luna catalog', /gpt-5\.6-luna/)
requireMatches('Claude Opus 5 catalog', /claude-opus-5/)
requireMatches('Claude Opus 5 Vertex region override', /VERTEX_REGION_CLAUDE_5_OPUS/)
requireMatches('Claude Sonnet 5 catalog', /claude-sonnet-5/)
requireMatches('Claude Sonnet 5 Vertex region override', /VERTEX_REGION_CLAUDE_5_SONNET/)
requireMatches(
  'ordinary max remains xhigh',
  /if\(level==="max"\|\|level==="ultracode"\)return"xhigh"/,
)
requireMatches(
  'Ultra maps to max wire effort',
  /if\(level==="ultra"\)return"max"/,
)
requireMatches(
  'root-only Ultra delegation prompt',
  /Proactive multi-agent delegation is active/,
)
requireMatches(
  'Ultra children inherit ordinary max',
  /parentEffort==="ultra"\?"max":parentEffort/,
)
requireMatches(
  'headless CLI accepts internal Ultra effort',
  /\["low","medium","high","xhigh","max","ultracode","ultra"\]/,
)
requireMatches(
  'Codex terminal assistant text recovery',
  /event\.event==="response\.output_text\.done"/,
)
requireMatches(
  'Codex terminal text deduplication',
  /completedText\.startsWith\(activeRawText\)/,
)

const remainingOpenClaudeOriginators = countMatches(
  /originator\s*:\s*"openclaude"/g,
)
if (remainingOpenClaudeOriginators !== 0) {
  throw new Error(
    `remaining openclaude originators: expected 0, found ${remainingOpenClaudeOriginators}`,
  )
}

const codexOriginators = countMatches(/originator\s*:\s*"codex_cli_rs"/g)
if (codexOriginators < 3) {
  throw new Error(
    `codex originators: expected at least 3, found ${codexOriginators}`,
  )
}

writeFileSync(cliPath, content)
console.log('Applied gacbert runtime patch guards to dist/cli.mjs')
