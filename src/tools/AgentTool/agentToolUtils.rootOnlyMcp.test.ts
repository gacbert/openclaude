import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../../test/sharedMutationLock.js'
import type { Tool } from '../../Tool.js'
import {
  filterRootOnlyMcpToolsForAgent,
  getRootOnlyMcpServerNames,
} from './rootOnlyMcpTools.js'

const originalRootOnlyServers =
  process.env.OPENCLAUDE_ROOT_ONLY_MCP_SERVERS

beforeEach(async () => {
  await acquireSharedMutationLock(
    'tools/AgentTool/agentToolUtils.rootOnlyMcp.test.ts',
  )
})

afterEach(() => {
  if (originalRootOnlyServers === undefined) {
    delete process.env.OPENCLAUDE_ROOT_ONLY_MCP_SERVERS
  } else {
    process.env.OPENCLAUDE_ROOT_ONLY_MCP_SERVERS = originalRootOnlyServers
  }
  releaseSharedMutationLock()
})

describe('root-only MCP server filtering', () => {
  test('parses a trimmed, de-duplicated comma-separated server list', () => {
    expect([
      ...getRootOnlyMcpServerNames(' telegram, notion ,, telegram '),
    ]).toEqual(['telegram', 'notion'])
  })

  test('matches MCP metadata and normalized tool-name prefixes', () => {
    process.env.OPENCLAUDE_ROOT_ONLY_MCP_SERVERS =
      'telegram, file delivery'

    const metadataMatch = createTool('attach_to_final', 'telegram')
    const prefixMatch = createTool(
      'mcp__file_delivery__attach_to_final',
    )
    const otherMcpTool = createTool('mcp__notion__create_page')
    const builtInTool = createTool('Read')

    expect(
      filterRootOnlyMcpToolsForAgent([
        metadataMatch,
        prefixMatch,
        otherMcpTool,
        builtInTool,
      ]),
    ).toEqual([otherMcpTool, builtInTool])
  })

  test('leaves agent tool pools unchanged when the setting is empty', () => {
    process.env.OPENCLAUDE_ROOT_ONLY_MCP_SERVERS = ' , '
    const tools = [createTool('mcp__telegram__attach_to_final')]

    expect(filterRootOnlyMcpToolsForAgent(tools)).toBe(tools)
  })
})

function createTool(name: string, serverName?: string): Tool {
  return {
    name,
    ...(serverName
      ? { mcpInfo: { serverName, toolName: 'attach_to_final' } }
      : {}),
  } as unknown as Tool
}
