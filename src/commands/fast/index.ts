import type { Command } from '../../commands.js'
import {
  FAST_MODE_SUPPORTED_MODELS_DISPLAY,
  isFastModeEnabled,
} from '../../utils/fastMode.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'

const fast = {
  type: 'local-jsx',
  name: 'fast',
  get description() {
    return `Toggle fast mode (${FAST_MODE_SUPPORTED_MODELS_DISPLAY} only)`
  },
  availability: ['claude-ai', 'console'],
  isEnabled: () => isFastModeEnabled(),
  get isHidden() {
    return !isFastModeEnabled()
  },
  argumentHint: '[on|off]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  load: () => import('./fast.js'),
} satisfies Command

export default fast
