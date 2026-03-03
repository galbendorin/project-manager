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
