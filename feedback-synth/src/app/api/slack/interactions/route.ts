import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  // 1. Verify Slack signature (similar to your events route)
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET!
  const timestamp = request.headers.get('x-slack-request-timestamp')!
  const rawBody = await request.text()
  const sigBaseString = `v0:${timestamp}:${rawBody}`
  const mySignature =
    'v0=' +
    crypto
      .createHmac('sha256', slackSigningSecret)
      .update(sigBaseString, 'utf8')
      .digest('hex')
  const slackSignature = request.headers.get('x-slack-signature')!

  if (!secureCompare(mySignature, slackSignature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // 2. Slack sends the interactive payload as form-encoded in `payload`
  //    We need to decode it and parse JSON
  const payloadStr = decodeURIComponent(rawBody.split('payload=')[1] || '')
  const payload = JSON.parse(payloadStr)

  // 3. Check the type of interactive event
  if (payload.type === 'block_actions') {
    const action = payload.actions[0]
    const actionId = action.action_id
    // The parsed GPT data is in action.value (JSON string)
    const gptData = JSON.parse(action.value || '{}')

    // Switch on the clicked button
    switch (actionId) {
      case 'confirm_feedback':
        await handleConfirm(payload, gptData)
        break
      case 'edit_feedback':
        await handleEdit(payload, gptData)
        break
      case 'flag_feedback':
        await handleFlag(payload, gptData)
        break
      default:
        console.log('Unknown action:', actionId)
    }
  }

  // Slack expects a 200 OK (JSON) quickly
  return NextResponse.json({ ok: true })
}

/** Compare signatures in a timing-safe way */
function secureCompare(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/** Example stub for Confirm */
async function handleConfirm(payload: { type: string; actions: { action_id: string; value: string }[] }, gptData: { [key: string]: unknown }) {
  // Maybe you store to Notion, log to DB, or just respond in Slack
  console.log('Confirming feedback:', gptData)
  // You could post an update to Slack: "Feedback confirmed!"
}

/** Example stub for Edit */
async function handleEdit(payload: { type: string; actions: { action_id: string; value: string }[] }, gptData: Record<string, unknown>) {
  // Maybe open a Slack Modal with the existing data pre-filled
  console.log('Editing feedback:', gptData)
}

/** Example stub for Flag */
async function handleFlag(payload: { type: string; actions: { action_id: string; value: string }[] }, gptData: Record<string, unknown>) {
  // Maybe send a DM to an admin
  console.log('Flagged feedback:', gptData)
}
