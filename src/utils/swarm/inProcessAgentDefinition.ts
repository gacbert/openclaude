import type { CustomAgentDefinition } from '../../tools/AgentTool/loadAgentsDir.js'
import { SEND_MESSAGE_TOOL_NAME } from '../../tools/SendMessageTool/constants.js'
import { TASK_CREATE_TOOL_NAME } from '../../tools/TaskCreateTool/constants.js'
import { TASK_GET_TOOL_NAME } from '../../tools/TaskGetTool/constants.js'
import { TASK_LIST_TOOL_NAME } from '../../tools/TaskListTool/constants.js'
import { TASK_UPDATE_TOOL_NAME } from '../../tools/TaskUpdateTool/constants.js'
import { TEAM_CREATE_TOOL_NAME } from '../../tools/TeamCreateTool/constants.js'
import { TEAM_DELETE_TOOL_NAME } from '../../tools/TeamDeleteTool/constants.js'

type InProcessAgentDefinitionOptions = {
  agentName: string
  teammateSystemPrompt: string
  agentDefinition?: CustomAgentDefinition
  defaultModel?: string
}

/**
 * Rebuild an agent definition for an in-process teammate while preserving the
 * custom settings that affect model execution.
 */
export function buildInProcessAgentDefinition({
  agentName,
  teammateSystemPrompt,
  agentDefinition,
  defaultModel,
}: InProcessAgentDefinitionOptions): CustomAgentDefinition {
  const fallbackModel = agentDefinition?.model ?? defaultModel

  return {
    agentType: agentName,
    whenToUse: `In-process teammate: ${agentName}`,
    getSystemPrompt: () => teammateSystemPrompt,
    // Inject team-essential tools so teammates can always respond to
    // shutdown requests, send messages, and coordinate via the task list,
    // even with explicit tool lists.
    tools: agentDefinition?.tools
      ? [
          ...new Set([
            ...agentDefinition.tools,
            SEND_MESSAGE_TOOL_NAME,
            TEAM_CREATE_TOOL_NAME,
            TEAM_DELETE_TOOL_NAME,
            TASK_CREATE_TOOL_NAME,
            TASK_GET_TOOL_NAME,
            TASK_LIST_TOOL_NAME,
            TASK_UPDATE_TOOL_NAME,
          ]),
        ]
      : ['*'],
    source: 'projectSettings',
    permissionMode: 'default',
    // Keep model and effort from the custom definition so runAgent() resolves
    // the same execution settings for native teammates as for other agents.
    ...(fallbackModel ? { model: fallbackModel } : {}),
    ...(agentDefinition?.effort !== undefined
      ? { effort: agentDefinition.effort }
      : {}),
  }
}
