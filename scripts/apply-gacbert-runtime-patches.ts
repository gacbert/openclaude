import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const cliPath = join(process.cwd(), 'dist', 'cli.mjs')
let content = readFileSync(cliPath, 'utf8')

function countMatches(search: string | RegExp) {
  return (content.match(search instanceof RegExp ? search : new RegExp(escapeRegExp(search), 'g')) ?? []).length
}

function requireContains(label: string, needle: string) {
  if (!content.includes(needle)) {
    throw new Error(`${label}: missing expected output`)
  }
}

// These should be generated from source patches. Keep this as a post-build
// guard so bundled output cannot silently lose Bert's Codex runtime fixes.
requireContains('headless model routing', 'mainLoopModel: effectiveModel ?? defaultState.mainLoopModel')
requireContains('headless model-for-session routing', 'mainLoopModelForSession: effectiveModel ?? defaultState.mainLoopModelForSession')
requireContains('codex responses originator', 'headers.originator = "codex_cli_rs"')
requireContains('codex responses user agent', 'headers["User-Agent"] = "codex_cli_rs/0.21.0"')

const remainingOpenClaudeOriginators = countMatches(/originator: "openclaude"/g)
if (remainingOpenClaudeOriginators !== 0) {
  throw new Error(`remaining openclaude originators: expected 0, found ${remainingOpenClaudeOriginators}`)
}

const codexOriginators = countMatches(/originator: "codex_cli_rs"/g)
if (codexOriginators < 3) {
  throw new Error(`codex originators: expected at least 3, found ${codexOriginators}`)
}

writeFileSync(cliPath, content)
console.log('Applied gacbert runtime patch guards to dist/cli.mjs')
