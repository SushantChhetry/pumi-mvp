import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json()

  // 1. Slack URL verification handshake
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge })
  }

  const event = body.event

  // 2. Only process non-bot user messages
  if (event?.type === 'message' && !event.bot_id) {
    const { user, text, channel, ts } = event
    const teamId = body.team_id // typically included at the top-level

    console.log(`[Slack Message] (team=${teamId} channel=${channel}) [${user}] ${text} @ ${ts}`)

    // (A) Insert the raw message into Supabase (same as before)
    const { error: insertError } = await supabase.from('slack_messages').insert({
      slack_user_id: user,
      slack_channel_id: channel,
      text,
      message_ts: ts,
      team_id: teamId
    })
    if (insertError) {
      console.error('[Supabase Insert Error]', insertError)
    }

    // (B) Fetch the workspace record from supabase to get bot_user_id + access_token
    const { data: teams, error: teamError } = await supabase
      .from('slack_teams')
      .select('access_token, bot_user_id')
      .eq('team_id', teamId)
      .single()

    if (teamError || !teams) {
      console.error('[Supabase Fetch Team Error]', teamError)
      // We can’t proceed without knowing the bot user ID or token
      return NextResponse.json({ ok: true })
    }

    const { access_token, bot_user_id } = teams

    // (C) Check if this text includes the bot’s user ID
    // For Slack, user mentions come as `<@UXXXXXX>`
    // So we do if (text.includes(`<@${bot_user_id}>`)) { ... }
    if (bot_user_id && text.includes(`<@${bot_user_id}>`)) {
      // (D) Respond via Slack using the workspace’s token
      await sendSlackMessage(channel, `Hello from PuMi! You said: "${text}"`, access_token)
    }
  }

  return NextResponse.json({ ok: true })
}

/**
 * Minimal helper to send a Slack message using the workspace’s bot token
 */
async function sendSlackMessage(channel: string, text: string, token: string) {
  if (!token) {
    console.error('No Slack Bot Token found for this workspace.')
    return
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text }),
  })

  const data = await res.json()
  if (!data.ok) {
    console.error('Slack API error:', data.error)
  }
}
