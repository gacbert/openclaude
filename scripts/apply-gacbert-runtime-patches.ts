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

// These should be generated from source patches. Keep this as a post-build
// guard so bundled output cannot silently lose Bert's Codex runtime fixes.
// Needles are whitespace-tolerant regexes: the 0.21.0 build minifies
// property/assignment spacing (`a:b??c`), which the old literal-string
// needles predated.
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
