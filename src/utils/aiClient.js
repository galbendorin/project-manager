/**
 * AI Client — calls the /api/ai-generate Vercel serverless proxy
 * 
 * The proxy receives the API key in the request body (never stored server-side),
 * forwards to the selected LLM provider, and streams the response back.
 */

const API_ENDPOINT = '/api/ai-generate'

/**
 * Generate AI content via the proxy
 * 
 * @param {Object} params
 * @param {string} params.provider - 'anthropic' or 'openai'
 * @param {string} params.apiKey - User's API key
 * @param {string} params.model - Model identifier
 * @param {string} params.systemPrompt - System prompt
 * @param {string} params.userMessage - User message content
 * @param {number} [params.maxTokens=4096] - Max tokens in response
 * @param {function} [params.onChunk] - Streaming callback (text chunk) — optional
 * @param {AbortSignal} [params.signal] - AbortController signal for cancellation
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
  signal
}) => {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        apiKey,
        model,
        systemPrompt,
        userMessage,
        maxTokens,
        stream: !!onChunk
      }),
      signal
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      const errMsg = errBody.error || `Provider returned ${response.status}`
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
                return { ok: false, error: parsed.error }
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
      return { ok: false, error: body.error }
    }
    return { ok: true, text: body.text || '' }

  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Request cancelled' }
    }
    return { ok: false, error: err.message || 'Failed to reach AI proxy' }
  }
}
