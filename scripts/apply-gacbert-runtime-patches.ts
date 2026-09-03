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

// --- gacbert: first-party Fable 5 / 5.1 support (0.25.0-gacbert.4) ---------
// The CLI has no Fable entry of its own on the anthropic route, so an
// unlisted Fable id silently loses its 1M window, 128k output, xhigh/max
// effort, adaptive-only thinking, structured outputs, and correct pricing.
// Each needle below is one of those gates; all key on the canonical name
// `claude-fable`, which both claude-fable-5 and claude-fable-5-1 collapse to.
requireMatches(
  'Fable native 1M context',
  /function modelUsesDefault1MContext\(model\)\{[\s\S]{0,700}?canonical\.includes\("claude-fable"\)/,
)
requireMatches('Fable 128k max output', /m\.includes\("claude-fable"\)/)
// Two sites: legacyModelSupportsMaxEffort and legacyModelSupportsXHighEffort.
const fableEffortGates = countMatches(
  /toLowerCase\(\)\.includes\("claude-fable"\)/g,
)
if (fableEffortGates < 2) {
  throw new Error(
    `Fable effort allowlists: expected 2 (max + xhigh), found ${fableEffortGates}`,
  )
}
// Three canonical gates: 1M context, adaptive-only thinking, structured
// outputs. Dropping any one is a silent capability regression.
const fableCanonicalGates = countMatches(
  /canonical\.includes\("claude-fable"\)/g,
)
if (fableCanonicalGates < 3) {
  throw new Error(
    `Fable canonical gates: expected 3 (1M, adaptive-only, structured outputs), found ${fableCanonicalGates}`,
  )
}
// Fable must NOT be default-adaptive: that gate is what lets
// `--max-thinking-tokens 0` emit thinking:{type:"disabled"}, which Fable 400s.
requireMatches(
  'Fable is adaptive-only, not default-adaptive',
  /function modelDefaultsToAdaptiveThinking\(model\)\{(?:(?!claude-fable)[\s\S]){0,300}?\}/,
)
requireMatches('Fable pricing entry', /"claude-fable":\s*COST_TIER_10_50/)
requireMatches('Fable 5.1 display name', /return"Fable 5\.1"/)

// --- gacbert: guards for patches that previously had none -----------------
// Fork-only helper; upstream's nearest equivalent (modelSupports1M) does not
// cover the Claude 5 family, so losing this silently 200k-caps Opus 5.
requireMatches(
  'default-1M context accounting helper',
  /function modelUsesDefault1MContext\(/,
)
const default1MCallSites = countMatches(/modelUsesDefault1MContext\(/g)
if (default1MCallSites < 6) {
  throw new Error(
    `modelUsesDefault1MContext call sites: expected >=6, found ${default1MCallSites}`,
  )
}
requireMatches(
  'Spark catalog metadata',
  /gptModel\("gpt-5\.3-codex-spark","GPT-5\.3-Codex-Spark",128000,32000/,
)
// "go" is dropped from the imperative verbs so a trailing "now go" in a user
// message cannot be read as an unfinished-turn signal.
requireMatches(
  'continuation VERB_ALT_IMPERATIVE drops "go"',
  /VERB_ALT_IMPERATIVE=ACTION_VERBS\d*\.filter\(\((\w+)\)=>\1!=="go"\)\.join\("\|"\)/,
)
requireMatches(
  'turn-scoped continuation nudge',
  /CONTINUATION_NUDGE_MESSAGE="Continue with the current user's latest request only\./,
)
// Terra, not Sol, is this fork's Codex default. Upstream #2051 (v0.28.0)
// moves codexplan to Sol; a merge that auto-resolves in upstream's favour
// would silently repoint every Codex turn.
requireMatches('codexplan default is Terra', /"codexplan \(gpt-5\.6-terra\)"/)
requireAbsent('codexplan flipped to Sol', /"codexplan \(gpt-5\.6-sol\)"/)
requireAbsent('Codex config default flipped to Sol', /codex:"gpt-5\.6-sol"/)
requireAbsent(
  'Codex provider default flipped to Sol',
  /OPENAI_MODEL\|\|"gpt-5\.6-sol"/,
)
const terraConfigDefaults = countMatches(/codex:"gpt-5\.6-terra"/g)
if (terraConfigDefaults < 10) {
  throw new Error(
    `Codex config defaults: expected >=10 Terra, found ${terraConfigDefaults}`,
  )
}
// Claude 5 thinking/effort mapping for the OpenAI-compatible shim. Upstream
// v0.30.0 splits openaiShim.ts into modules; this must be re-homed, not lost.
requireMatches(
  'Claude 5 shim reasoning fields',
  /function getAnthropicMessagesReasoningFields\(/,
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
