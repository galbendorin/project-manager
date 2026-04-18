/**
 * /api/ai-generate — Vercel serverless proxy for LLM calls
 * 
 * Receives the user's API key via X-Api-Key header, forwards to the
 * selected provider, and returns (or streams) the response.
 * 
 * The key is only in-transit; it is never logged or stored.
 */

import { applyApiCors, getAdminSupabase, requireAuthenticatedUser } from './_auth.js'
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const OPENAI_API = 'https://api.openai.com/v1/chat/completions'
const adminSupabase = getAdminSupabase()

// Max request body size (200KB — generous for prompts)
const MAX_BODY_SIZE = 200_000

const isMissingAiAllowanceRpcError = (error) => {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return code === '42883'
    || message.includes('claim_ai_generation_allowance')
    || message.includes('finalize_ai_generation_allowance')
    || message.includes('release_ai_generation_allowance')
    || message.includes('ai_generation_reservations')
}

export const resolveAiAllowanceFailure = (result = {}) => {
  switch (String(result?.code || '')) {
    case 'ai_not_included':
      return { status: 403, error: 'Your current plan does not include AI access.' }
    case 'platform_ai_disabled':
      return { status: 403, error: 'Platform AI is not enabled for this account. Please configure your own API key in AI Settings.' }
    case 'ai_quota_exceeded':
      return { status: 403, error: "You've reached your AI report limit for this month. Upgrade for more reports." }
    case 'missing_user':
      return { status: 401, error: 'Authentication required.' }
    default:
      return { status: 500, error: 'Unable to verify AI access for this account.' }
  }
}

const claimAiAllowance = async ({ userId, usageSource }) => {
  return adminSupabase.rpc('claim_ai_generation_allowance', {
    target_user_id: userId,
    usage_source: usageSource,
  })
}

const finalizeAiAllowance = async (reservationId) => {
  return adminSupabase.rpc('finalize_ai_generation_allowance', {
    target_reservation_id: reservationId,
  })
}

const releaseAiAllowance = async (reservationId) => {
  return adminSupabase.rpc('release_ai_generation_allowance', {
    target_reservation_id: reservationId,
  })
}

export default async function handler(req, res) {
  applyApiCors(req, res)

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!adminSupabase) {
    return res.status(500).json({ error: 'Server billing configuration is incomplete.' })
  }

  // Reject oversized payloads
  const bodyStr = JSON.stringify(req.body || {})
  if (bodyStr.length > MAX_BODY_SIZE) {
    return res.status(413).json({ error: 'Request body too large' })
  }

  const user = await requireAuthenticatedUser(req, res)
  if (!user) return

  // Accept API key from header only.
  const userApiKey = req.headers['x-api-key']
  const { provider, model, systemPrompt, userMessage, maxTokens = 4096, stream = false, usePlatformKey = false } = req.body || {}
  const requestedPlatformKey = Boolean(usePlatformKey && !userApiKey)

  const limitResult = await checkRateLimit({
    key: `ai:${user.id}:${getClientIp(req)}:${requestedPlatformKey ? 'platform' : 'byok'}`,
    max: requestedPlatformKey ? 24 : 60,
    windowMs: 60_000,
    strictShared: true,
  })
  if (!limitResult.ok) {
    return sendRateLimitResponse(res, limitResult, 'AI requests are coming in too quickly. Please wait a moment and try again.')
  }

  // Platform key mode: trial users use the server-side Anthropic key
  let apiKey = userApiKey
  let resolvedProvider = provider
  let resolvedModel = model

  if (usePlatformKey && !userApiKey) {
    const platformKey = process.env.PLATFORM_AI_KEY
    if (!platformKey) {
      return res.status(503).json({ error: 'Platform AI is temporarily unavailable. Please configure your own API key in AI Settings.' })
    }
    apiKey = platformKey
    resolvedProvider = 'gemini'
    resolvedModel = 'gemini-2.5-flash-lite' // Cost-efficient model for trial users
  }

  if (!resolvedProvider || !apiKey || !userMessage) {
    return res.status(400).json({ error: 'Missing required fields: provider, apiKey, userMessage' })
  }

  if (!['anthropic', 'openai', 'gemini'].includes(String(resolvedProvider || '').toLowerCase())) {
    return res.status(400).json({ error: `Unsupported provider: ${resolvedProvider}` })
  }

  // Clamp maxTokens to prevent abuse
  const safeMaxTokens = Math.min(Math.max(parseInt(maxTokens) || 4096, 256), 16384)
  const usageSource = requestedPlatformKey ? 'platform' : 'byok'
  let reservationId = ''
  let allowanceFinalized = false

  try {
    const { data: allowanceClaim, error: allowanceClaimError } = await claimAiAllowance({
      userId: user.id,
      usageSource,
    })

    if (allowanceClaimError) {
      if (isMissingAiAllowanceRpcError(allowanceClaimError)) {
        return res.status(503).json({ error: 'AI entitlements are not configured yet. Apply the latest billing migration first.' })
      }
      console.error('Failed to claim AI allowance:', allowanceClaimError)
      return res.status(500).json({ error: 'Unable to verify AI access for this account.' })
    }

    if (!allowanceClaim?.ok) {
      const failure = resolveAiAllowanceFailure(allowanceClaim)
      return res.status(failure.status).json({ error: failure.error })
    }

    reservationId = String(allowanceClaim.reservation_id || '')
    if (!reservationId) {
      return res.status(500).json({ error: 'Unable to verify AI access for this account.' })
    }

    const markAllowanceConsumed = async () => {
      if (allowanceFinalized || !reservationId) return

      const { error } = await finalizeAiAllowance(reservationId)
      if (error) {
        throw error
      }

      allowanceFinalized = true
    }

    let providerResult
    if (resolvedProvider === 'anthropic') {
      providerResult = await handleAnthropic({ apiKey, model: resolvedModel, systemPrompt, userMessage, maxTokens: safeMaxTokens, stream }, res, markAllowanceConsumed)
    } else if (resolvedProvider === 'openai') {
      providerResult = await handleOpenAI({ apiKey, model: resolvedModel, systemPrompt, userMessage, maxTokens: safeMaxTokens, stream }, res, markAllowanceConsumed)
    } else {
      providerResult = await handleGemini({ apiKey, model: resolvedModel, systemPrompt, userMessage, maxTokens: safeMaxTokens, stream }, res, markAllowanceConsumed)
    }

    if (!providerResult?.ok && reservationId && !allowanceFinalized) {
      const { error } = await releaseAiAllowance(reservationId)
      if (error) {
        console.error('Failed to release AI allowance after upstream rejection:', error)
      }
    }

    return
  } catch (err) {
    if (reservationId && !allowanceFinalized) {
      const { error } = await releaseAiAllowance(reservationId)
      if (error) {
        console.error('Failed to release AI allowance after proxy error:', error)
      }
    }
    console.error('AI proxy error:', err.message)
    return res.status(500).json({ error: 'Internal proxy error' })
  }
}

async function handleAnthropic({ apiKey, model, systemPrompt, userMessage, maxTokens, stream }, res, onAccepted) {
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
    res.status(response.status).json({ error: `Anthropic: ${errMsg}` })
    return { ok: false }
  }

  await onAccepted?.()

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
    return { ok: true }
  }

  // Non-streaming
  const data = await response.json()
  const text = (data.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')

  res.status(200).json({ text })
  return { ok: true }
}

async function handleOpenAI({ apiKey, model, systemPrompt, userMessage, maxTokens, stream }, res, onAccepted) {
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
    res.status(response.status).json({ error: `OpenAI: ${errMsg}` })
    return { ok: false }
  }

  await onAccepted?.()

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
    return { ok: true }
  }

  // Non-streaming
  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || ''
  res.status(200).json({ text })
  return { ok: true }
}

async function handleGemini({ apiKey, model, systemPrompt, userMessage, maxTokens, stream }, res, onAccepted) {
  const geminiModel = model || 'gemini-2.5-flash'
  const endpoint = stream ? 'streamGenerateContent' : 'generateContent'
  const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:${endpoint}`

  const contents = []
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] })
    contents.push({ role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] })
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] })

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens
    }
  }

  const fetchUrl = stream ? `${baseUrl}?alt=sse` : baseUrl

  const response = await fetch(fetchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errText = await response.text()
    let errMsg
    try {
      const errJson = JSON.parse(errText)
      errMsg = errJson.error?.message || errJson.error?.status || errText
    } catch {
      errMsg = errText
    }
    res.status(response.status).json({ error: `Gemini: ${errMsg}` })
    return { ok: false }
  }

  await onAccepted?.()

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
            try {
              const event = JSON.parse(line.slice(6))
              const text = event.candidates?.[0]?.content?.parts?.[0]?.text
              if (text) {
                res.write(`data: ${JSON.stringify({ text })}\n\n`)
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      }
      res.write('data: [DONE]\n\n')
    } finally {
      res.end()
    }
    return { ok: true }
  }

  // Non-streaming
  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''
  res.status(200).json({ text })
  return { ok: true }
}
