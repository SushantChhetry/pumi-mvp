// src/app/api/auth/slack/messages/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type SlackChannel = {
  id: string
  name: string
}

export async function GET() {
  console.log('[GET] Fetching messages from Supabase-stored Slack bot token')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 1. Get stored bot token from Supabase
  const { data: teams, error } = await supabase.from('slack_teams').select('*').limit(1)

  if (error || !teams?.length) {
    console.error('[GET] Failed to fetch Slack token:', error)
    return NextResponse.json({ error: 'Bot token not found' }, { status: 500 })
  }

  const token = teams[0].access_token

  try {
    // 2. Get channel ID of #user-feedback
    const listRes = await fetch('https://slack.com/api/conversations.list', {
      headers: { Authorization: `Bearer ${token}` }
    })

    const listData = await listRes.json()

    if (!listData.ok) {
      console.error('[GET] Slack error: conversations.list', listData.error)
      return NextResponse.json({ error: listData.error }, { status: 500 })
    }

    const feedbackChannel = (listData.channels as SlackChannel[]).find(
      (ch) => ch.name === 'user-feedback'
    )

    if (!feedbackChannel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    // 3. Fetch channel messages
    const historyRes = await fetch(
      `https://slack.com/api/conversations.history?channel=${feedbackChannel.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    const historyData = await historyRes.json()

    if (!historyData.ok) {
      console.error('[GET] Slack error: conversations.history', historyData.error)
      return NextResponse.json({ error: historyData.error }, { status: 500 })
    }

    return NextResponse.json({ messages: historyData.messages })
  } catch (err) {
    console.error('[GET] Unexpected error:', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
