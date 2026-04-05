/**
 * AI Settings — BYOK (Bring Your Own Key) management
 * 
 * Stored in browser storage only. API keys never touch the server/database.
 * Supports Anthropic (Claude) and OpenAI providers.
 */

const STORAGE_KEY = 'pm_os_ai_settings'
const STORAGE_SCOPES = {
  session: 'session',
  local: 'local'
}

const getLocalStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

const getSessionStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

const readStoredSettings = (storage) => {
  if (!storage) return null
  try {
    const raw = storage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const writeStoredSettings = (storage, settings) => {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings))
    return true
  } catch {
    return false
  }
}

const clearStoredSettings = (storage) => {
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // silent
  }
}

const normalizeGeminiModel = (model) => {
  if (model === 'gemini-2.0-flash') return 'gemini-2.5-flash'
  if (model === 'gemini-2.0-flash-lite') return 'gemini-2.5-flash-lite'
  return model
}

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
  },
  gemini: {
    id: 'gemini',
    label: 'Google (Gemini)',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' }
    ],
    keyPrefix: 'AI',
    keyPlaceholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/apikey'
  }
}

const DEFAULT_SETTINGS = {
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-4-20250514',
  configured: false,
  storageScope: STORAGE_SCOPES.session
}

const normalizeParsedSettings = (parsed = {}, storageScope = DEFAULT_SETTINGS.storageScope) => {
  const provider = parsed.provider || DEFAULT_SETTINGS.provider
  const model = provider === 'gemini'
    ? normalizeGeminiModel(parsed.model || PROVIDERS.gemini.defaultModel)
    : (parsed.model || PROVIDERS[provider]?.defaultModel || DEFAULT_SETTINGS.model)

  return {
    provider,
    apiKey: parsed.apiKey || DEFAULT_SETTINGS.apiKey,
    model,
    configured: !!(parsed.apiKey && provider),
    storageScope
  }
}

/**
 * Load AI settings from sessionStorage first, then localStorage
 */
export const loadAiSettings = () => {
  const sessionStorage = getSessionStorage()
  const localStorage = getLocalStorage()

  const sessionSettings = readStoredSettings(sessionStorage)
  if (sessionSettings?.apiKey) {
    const normalized = normalizeParsedSettings(sessionSettings, STORAGE_SCOPES.session)
    if (normalized.provider === 'gemini' && normalized.model !== sessionSettings.model) {
      writeStoredSettings(sessionStorage, normalized)
    }
    return normalized
  }

  const localSettings = readStoredSettings(localStorage)
  if (localSettings?.apiKey) {
    const normalized = normalizeParsedSettings(localSettings, STORAGE_SCOPES.local)
    if (normalized.provider === 'gemini' && normalized.model !== localSettings.model) {
      writeStoredSettings(localStorage, normalized)
    }
    return normalized
  }

  return { ...DEFAULT_SETTINGS }
}

/**
 * Save AI settings to the selected browser storage
 */
export const saveAiSettings = ({ provider, apiKey, model, storageScope = DEFAULT_SETTINGS.storageScope }) => {
  const normalizedProvider = provider || DEFAULT_SETTINGS.provider
  const normalizedModel = normalizedProvider === 'gemini'
    ? normalizeGeminiModel(model || PROVIDERS.gemini.defaultModel)
    : (model || PROVIDERS[normalizedProvider]?.defaultModel || DEFAULT_SETTINGS.model)
  const normalizedScope = storageScope === STORAGE_SCOPES.local ? STORAGE_SCOPES.local : STORAGE_SCOPES.session
  const settings = {
    provider: normalizedProvider,
    apiKey: (apiKey || '').trim(),
    model: normalizedModel,
    configured: !!(apiKey && provider),
    storageScope: normalizedScope
  }

  const sessionStorage = getSessionStorage()
  const localStorage = getLocalStorage()
  const targetStorage = normalizedScope === STORAGE_SCOPES.local ? localStorage : sessionStorage
  const otherStorage = normalizedScope === STORAGE_SCOPES.local ? sessionStorage : localStorage

  clearStoredSettings(otherStorage)
  writeStoredSettings(targetStorage, settings)

  return settings
}

/**
 * Clear AI settings from browser storage
 */
export const clearAiSettings = () => {
  clearStoredSettings(getSessionStorage())
  clearStoredSettings(getLocalStorage())
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

export { PROVIDERS, DEFAULT_SETTINGS, STORAGE_SCOPES }
