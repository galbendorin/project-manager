/**
 * /api/ai-generate — Vercel serverless proxy for LLM calls
 * 
 * Receives the user's API key in the request body, forwards to the
 * selected provider, and returns (or streams) the response.
 * 
 * The key is only in-transit; it is never logged or stored.
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const OPENAI_API = 'https://api.openai.com/v1/chat/completions'

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { provider, apiKey, model, systemPrompt, userMessage, maxTokens = 4096, stream = false } = req.body || {}

  if (!provider || !apiKey || !userMessage) {
    return res.status(400).json({ error: 'Missing required fields: provider, apiKey, userMessage' })
  }

  try {
    if (provider === 'anthropic') {
      return await handleAnthropic({ apiKey, model, systemPrompt, userMessage, maxTokens, stream }, res)
    } else if (provider === 'openai') {
      return await handleOpenAI({ apiKey, model, systemPrompt, userMessage, maxTokens, stream }, res)
    } else {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` })
    }
  } catch (err) {
    console.error('AI proxy error:', err)
    return res.status(500).json({ error: err.message || 'Internal proxy error' })
  }
}

async function handleAnthropic({ apiKey, model, systemPrompt, userMessage, maxTokens, stream }, res) {
  const body = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: userMessage }]
  }
  if (systemPrompt) {
    body.system = systemPrompt
  }
  if (stream) {
    body.stream = true
  }

  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errText = await response.text()
    let errMsg
    try {
      const errJson = JSON.parse(errText)
      errMsg = errJson.error?.message || errJson.error || errText
    } catch {
      errMsg = errText
    }
    return res.status(response.status).json({ error: `Anthropic: ${errMsg}` })
  }

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        
        // Parse Anthropic SSE events and re-emit as our simplified format
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'content_block_delta' && event.delta?.text) {
                res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
              } else if (event.type === 'message_stop') {
                res.write('data: [DONE]\n\n')
              } else if (event.type === 'error') {
                res.write(`data: ${JSON.stringify({ error: event.error?.message || 'Stream error' })}\n\n`)
              }
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      }
    } finally {
      res.end()
    }
    return
  }

  // Non-streaming
  const data = await response.json()
  const text = (data.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')

  return res.status(200).json({ text })
}

async function handleOpenAI({ apiKey, model, systemPrompt, userMessage, maxTokens, stream }, res) {
  const messages = []
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }
  messages.push({ role: 'user', content: userMessage })

  const body = {
    model: model || 'gpt-4o',
    messages,
    max_tokens: maxTokens
  }
  if (stream) {
    body.stream = true
  }

  const response = await fetch(OPENAI_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errText = await response.text()
    let errMsg
    try {
      const errJson = JSON.parse(errText)
      errMsg = errJson.error?.message || errJson.error || errText
    } catch {
      errMsg = errText
    }
    return res.status(response.status).json({ error: `OpenAI: ${errMsg}` })
  }

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n')
              continue
            }
            try {
              const event = JSON.parse(data)
              const text = event.choices?.[0]?.delta?.content
              if (text) {
                res.write(`data: ${JSON.stringify({ text })}\n\n`)
              }
            } catch {
              // Skip
            }
          }
        }
      }
    } finally {
      res.end()
    }
    return
  }

  // Non-streaming
  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || ''
  return res.status(200).json({ text })
}
