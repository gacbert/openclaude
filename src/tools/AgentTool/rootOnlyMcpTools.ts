import { getMcpPrefix } from '../../services/mcp/mcpStringUtils.js'
import type { Tool, Tools } from '../../Tool.js'

export function getRootOnlyMcpServerNames(
  value = process.env.OPENCLAUDE_ROOT_ONLY_MCP_SERVERS,
): ReadonlySet<string> {
  return new Set(
    value
      ?.split(',')
      .map(serverName => serverName.trim())
      .filter(Boolean) ?? [],
  )
}

export function isRootOnlyMcpTool(
  tool: Pick<Tool, 'name' | 'mcpInfo'>,
  rootOnlyServerNames: ReadonlySet<string>,
): boolean {
  if (rootOnlyServerNames.size === 0) {
    return false
  }

  if (
    tool.mcpInfo &&
    rootOnlyServerNames.has(tool.mcpInfo.serverName)
  ) {
    return true
  }

  for (const serverName of rootOnlyServerNames) {
    if (tool.name.startsWith(getMcpPrefix(serverName))) {
      return true
    }
  }

  return false
}

/**
 * Removes MCP servers reserved for the root session from a child agent's tool
 * pool. Call this on every path that assembles tools for an agent, including
 * exact-tool forks and agent-specific MCP merges.
 */
export function filterRootOnlyMcpToolsForAgent(tools: Tools): Tools {
  const rootOnlyServerNames = getRootOnlyMcpServerNames()
  if (rootOnlyServerNames.size === 0) {
    return tools
  }

  return tools.filter(
    tool => !isRootOnlyMcpTool(tool, rootOnlyServerNames),
  )
}
