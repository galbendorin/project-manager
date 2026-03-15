/**
 * AI Client — calls the /api/ai-generate Vercel serverless proxy
 * 
 * The proxy receives the API key in the request body (never stored server-side),
 * forwards to the selected LLM provider, and streams the response back.
 */

const API_ENDPOINT = '/api/ai-generate'
const MAX_USER_MESSAGE_CHARS = 120_000

const truncatePrompt = (value, limit = MAX_USER_MESSAGE_CHARS) => {
  if (!value) return ''
  if (value.length <= limit) return value
  const keep = Math.max(2000, limit - 240)
  return `${value.slice(0, keep)}\n\n[TRUNCATED: prompt exceeded safe client limit for proxy payload size]`
}

const normalizeAiError = (message = '', status, { usePlatformKey = false } = {}) => {
  const text = String(message || '').toLowerCase()
  if (status === 413 || text.includes('too large')) {
    return 'Request too large. Narrow the date range or reduce notes and try again.'
  }
  if (text.includes('invalid api key') || text.includes('incorrect api key') || text.includes('authentication')) {
    return 'API key rejected. Re-check provider, key, and key permissions in AI settings.'
  }
  if (text.includes('quota') || text.includes('billing') || text.includes('insufficient credits')) {
    if (usePlatformKey) {
      return 'Trial AI capacity is currently exhausted. Open AI Settings to use your own key, or try again later.'
    }
    return 'Provider quota/billing limit reached. Check your AI provider account.'
  }
  if (text.includes('rate limit') || status === 429) {
    if (usePlatformKey) {
      return 'Trial AI capacity is busy right now. Open AI Settings to use your own key, or try again shortly.'
    }
    return 'Rate limit reached. Wait a moment and retry.'
  }
  if (usePlatformKey && (text.includes('temporarily unavailable') || text.includes('platform ai'))) {
    return 'Trial AI is temporarily unavailable. Open AI Settings to use your own key.'
  }
  if (text.includes('model') && (text.includes('not found') || text.includes('unsupported'))) {
    return 'Selected model is unavailable for this key. Pick another model in AI settings.'
  }
  return message || 'AI request failed'
}

/**
 * Generate AI content via the proxy
 * 
 * @param {Object} params
 * @param {string} params.provider - 'anthropic', 'openai', or 'gemini'
 * @param {string} [params.apiKey] - User's API key (optional if usePlatformKey)
 * @param {string} params.model - Model identifier
 * @param {string} params.systemPrompt - System prompt
 * @param {string} params.userMessage - User message content
 * @param {number} [params.maxTokens=4096] - Max tokens in response
 * @param {function} [params.onChunk] - Streaming callback (text chunk) — optional
 * @param {AbortSignal} [params.signal] - AbortController signal for cancellation
 * @param {boolean} [params.usePlatformKey=false] - Use server-side platform key (trial users)
 * @returns {Promise<{ok: boolean, text?: string, error?: string}>}
 */
export const generateAiContent = async ({
  provider,
  apiKey,
  model,
  systemPrompt,
  userMessage,
  maxTokens = 4096,
  onChunk,
  signal,
  usePlatformKey = false
}) => {
  try {
    const safeUserMessage = truncatePrompt(userMessage)
    const safeSystemPrompt = truncatePrompt(systemPrompt, 20_000)

    const headers = { 'Content-Type': 'application/json' }
    if (apiKey && !usePlatformKey) {
      headers['X-Api-Key'] = apiKey
    }

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider,
        model,
        systemPrompt: safeSystemPrompt,
        userMessage: safeUserMessage,
        maxTokens,
        stream: !!onChunk,
        ...(usePlatformKey ? { usePlatformKey: true } : {})
      }),
      signal
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      const rawErr = errBody.error || `Provider returned ${response.status}`
      const errMsg = normalizeAiError(rawErr, response.status, { usePlatformKey })
      return { ok: false, error: errMsg }
    }

    // Streaming mode
    if (onChunk && response.body) {
      let fullText = ''
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        
        // Parse SSE lines
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.text) {
                fullText += parsed.text
                onChunk(parsed.text, fullText)
              }
              if (parsed.error) {
                return { ok: false, error: normalizeAiError(parsed.error, undefined, { usePlatformKey }) }
              }
            } catch {
              // Non-JSON data line, treat as text
              if (data && data !== '[DONE]') {
                fullText += data
                onChunk(data, fullText)
              }
            }
          }
        }
      }

      return { ok: true, text: fullText }
    }

    // Non-streaming mode
    const body = await response.json()
    if (body.error) {
      return { ok: false, error: normalizeAiError(body.error, undefined, { usePlatformKey }) }
    }
    return { ok: true, text: body.text || '' }

  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Request cancelled' }
    }
    return { ok: false, error: normalizeAiError(err.message || 'Failed to reach AI proxy', undefined, { usePlatformKey }) }
  }
}
