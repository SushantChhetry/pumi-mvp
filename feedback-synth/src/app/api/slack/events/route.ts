import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Slack URL verification handshake
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge })
  }

  // Only process non-bot user messages
  const event = body.event
  if (event?.type === 'message' && !event.bot_id) {
    const { user, text, channel, ts } = event
    console.log(`[Slack Message] (${channel}) [${user}] ${text} @ ${ts}`)

    const { error } = await supabase.from('slack_messages').insert({
      slack_user_id: user,
      slack_channel_id: channel,
      text,
      message_ts: ts
    })

    if (error) {
      console.error('[Supabase Insert Error]', error)
    }
  }

  return NextResponse.json({ ok: true })
}
