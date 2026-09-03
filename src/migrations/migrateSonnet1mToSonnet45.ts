import {
  getMainLoopModelOverride,
  setMainLoopModelOverride,
} from '../bootstrap/state.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import {
  isFirstPartyAnthropicProvider,
} from '../utils/model/providers.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'

/**
 * Migrate users who had "sonnet[1m]" saved to the explicit "sonnet-4-5-20250929[1m]".
 *
 * When this historical migration was introduced, the "sonnet" alias moved to
 * Sonnet 4.6. Users who had selected "sonnet[1m]" to target Sonnet 4.5 were
 * pinned to the explicit version so later alias launches preserve that intent.
 *
 * This is needed because Sonnet 4.6 1M was offered to a different group of users than
 * Sonnet 4.5 1M, so we needed to pin existing sonnet[1m] users to Sonnet 4.5 1M.
 *
 * Reads from userSettings specifically (not merged settings) so we don't
 * promote a project-scoped "sonnet[1m]" to the global default. Runs once,
 * tracked by a completion flag in global config.
 */
export function migrateSonnet1mToSonnet45(): void {
  if (!isFirstPartyAnthropicProvider()) {
    return
  }

  const config = getGlobalConfig()
  if (config.sonnet1m45MigrationComplete) {
    return
  }

  const model = getSettingsForSource('userSettings')?.model
  if (model === 'sonnet[1m]') {
    updateSettingsForSource('userSettings', {
      model: 'sonnet-4-5-20250929[1m]',
    })
  }

  // Also migrate the in-memory override if already set
  const override = getMainLoopModelOverride()
  if (override === 'sonnet[1m]') {
    setMainLoopModelOverride('sonnet-4-5-20250929[1m]')
  }

  saveGlobalConfig(current => ({
    ...current,
    sonnet1m45MigrationComplete: true,
  }))
}
