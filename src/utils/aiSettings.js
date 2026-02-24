/**
 * AI Settings — BYOK (Bring Your Own Key) management
 * 
 * Stored in localStorage only. API keys never touch the server/database.
 * Supports Anthropic (Claude) and OpenAI providers.
 */

const STORAGE_KEY = 'pm_os_ai_settings'

const PROVIDERS = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }
    ],
    keyPrefix: 'sk-ant-',
    keyPlaceholder: 'sk-ant-api03-...',
    docsUrl: 'https://console.anthropic.com/settings/keys'
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (GPT)',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' }
    ],
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys'
  }
}

const DEFAULT_SETTINGS = {
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-4-20250514',
  configured: false
}

/**
 * Load AI settings from localStorage
 */
export const loadAiSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw)
    return {
      provider: parsed.provider || DEFAULT_SETTINGS.provider,
      apiKey: parsed.apiKey || DEFAULT_SETTINGS.apiKey,
      model: parsed.model || DEFAULT_SETTINGS.model,
      configured: !!(parsed.apiKey && parsed.provider)
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * Save AI settings to localStorage
 */
export const saveAiSettings = ({ provider, apiKey, model }) => {
  const settings = {
    provider: provider || DEFAULT_SETTINGS.provider,
    apiKey: (apiKey || '').trim(),
    model: model || PROVIDERS[provider]?.defaultModel || DEFAULT_SETTINGS.model,
    configured: !!(apiKey && provider)
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // localStorage full or unavailable — silent fail
  }
  return settings
}

/**
 * Clear AI settings from localStorage
 */
export const clearAiSettings = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // silent
  }
  return { ...DEFAULT_SETTINGS }
}

/**
 * Validate that settings are sufficient for an API call
 */
export const isAiConfigured = (settings) => {
  return !!(settings?.apiKey && settings?.provider && PROVIDERS[settings.provider])
}

/**
 * Mask API key for display (show first 8 + last 4 chars)
 */
export const maskApiKey = (key) => {
  if (!key || key.length < 16) return key ? '••••••••' : ''
  return `${key.slice(0, 8)}${'•'.repeat(Math.min(20, key.length - 12))}${key.slice(-4)}`
}

export { PROVIDERS, DEFAULT_SETTINGS }
