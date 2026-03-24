import test from 'node:test'
import assert from 'node:assert/strict'
import { generateAiContent } from './aiClient.js'

test('generateAiContent maps 413 payload errors to friendly message', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => ({
    ok: false,
    status: 413,
    json: async () => ({ error: 'Request body too large' })
  })

  const result = await generateAiContent({
    provider: 'openai',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
    systemPrompt: 'sys',
    userMessage: 'hello'
  })

  global.fetch = originalFetch

  assert.equal(result.ok, false)
  assert.match(result.error, /request too large/i)
})

test('generateAiContent truncates oversized user messages before sending', async () => {
  const originalFetch = global.fetch
  let capturedBody = null

  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body)
    return {
      ok: true,
      json: async () => ({ text: 'OK' })
    }
  }

  const longText = 'A'.repeat(130000)
  const result = await generateAiContent({
    provider: 'openai',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
    systemPrompt: 'sys',
    userMessage: longText
  })

  global.fetch = originalFetch

  assert.equal(result.ok, true)
  assert.ok(capturedBody)
  assert.ok(capturedBody.userMessage.length < longText.length)
  assert.match(capturedBody.userMessage, /\[TRUNCATED:/)
})

test('generateAiContent forwards bearer auth when using platform AI', async () => {
  const originalFetch = global.fetch
  const originalWindow = global.window
  const storage = new Map([
    ['sb-test-auth-token', JSON.stringify({ access_token: 'access-token-123' })],
  ])

  global.window = {
    localStorage: {
      get length() {
        return storage.size
      },
      key(index) {
        return Array.from(storage.keys())[index] || null
      },
      getItem(key) {
        return storage.get(key) || null
      },
    },
  }

  let capturedHeaders = null
  global.fetch = async (_url, options) => {
    capturedHeaders = options.headers
    return {
      ok: true,
      json: async () => ({ text: 'OK' })
    }
  }

  const result = await generateAiContent({
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    systemPrompt: 'sys',
    userMessage: 'hello',
    usePlatformKey: true
  })

  global.fetch = originalFetch
  global.window = originalWindow

  assert.equal(result.ok, true)
  assert.equal(capturedHeaders.Authorization, 'Bearer access-token-123')
})
