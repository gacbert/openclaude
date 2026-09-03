import { getDefaultOpusModel } from '../model/model.js'

// @[MODEL LAUNCH]: Update the fallback model below.
// When the user has never set teammateDefaultModel in /config, new teammates
// use the provider's current default Opus. This keeps aliases, provider-specific
// IDs, and ANTHROPIC_DEFAULT_OPUS_MODEL aligned with the main model router.
export function getHardcodedTeammateModelFallback(): string {
  return getDefaultOpusModel()
}
