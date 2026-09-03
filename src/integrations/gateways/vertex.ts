import { defineGateway } from '../define.js'

/**
 * Google Vertex AI has dedicated transport behavior that is not yet fully
 * normalized into the generic descriptor model. It relies on ambient GCP
 * credentials and uses a separate runtime path.
 *
 * Do not collapse this into generic OpenAI-compatible routing.
 */
export default defineGateway({
  id: 'vertex',
  label: 'Google Vertex AI',
  vendorId: 'anthropic',
  category: 'hosted',
  supportsModelRouting: true,
  setup: {
    requiresAuth: true,
    authMode: 'adc',
  },
  transportConfig: {
    kind: 'vertex',
  },
  catalog: {
    source: 'static',
    models: [
      {
        id: 'vertex-claude-opus',
        apiName: 'claude-opus-5',
        label: 'Claude Opus 5 (Vertex)',
        modelDescriptorId: 'claude-opus-5',
      },
      {
        id: 'vertex-claude-sonnet',
        apiName: 'claude-sonnet-5',
        label: 'Claude Sonnet 5 (Vertex)',
        modelDescriptorId: 'claude-sonnet-5',
      },
    ],
  },
  usage: { supported: false },
})
