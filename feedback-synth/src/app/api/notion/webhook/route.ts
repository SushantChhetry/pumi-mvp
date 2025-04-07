// src/app/api/notion/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server'

const NOTION_WEBHOOK_SECRET = process.env.NOTION_WEBHOOK_SECRET!

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const data = JSON.parse(rawBody)

  // ✅ Verification step
  if (data.verification_token) {
    console.log('[Webhook] 🛡️ Received verification token:', data.verification_token)

    if (data.verification_token !== NOTION_WEBHOOK_SECRET) {
      console.warn('[Webhook] ❌ Invalid verification token')
      return NextResponse.json({ error: 'Invalid verification token' }, { status: 401 })
    }

    if (data.challenge) {
      console.log('[Webhook] 🔒 Responding to verification challenge:', data.challenge)
      return NextResponse.json({ challenge: data.challenge })
    }
  }

  // ✅ Actual event handling
  console.log('[Webhook] ✅ Received Notion event:', data)

  return NextResponse.json({ received: true })
}
