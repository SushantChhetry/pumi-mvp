import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/utils/crypto'
import { logger } from '@/lib/utils/logger'

type SlackChannel = {
  id: string
  name: string
}

export async function GET() {
  logger.info('[GET] Starting fetch for Slack messages...')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 1. Get stored (encrypted) bot token from Supabase
  logger.info('[Supabase] Fetching Slack team credentials...')
  const { data: teams, error } = await supabase.from('slack_teams').select('*').limit(1)

  if (error || !teams?.length) {
    console.error('[Supabase Error] Failed to fetch Slack token:', error)
    return NextResponse.json({ error: 'Bot token not found' }, { status: 500 })
  }

  const encryptedToken = teams[0].access_token
  const decryptedToken = decrypt(encryptedToken)
  logger.info('[Supabase] Retrieved and decrypted Slack token for team:', teams[0].team_name)

  try {
    // 2. Get channel ID of #user-feedback
    logger.info('[Slack API] Fetching list of conversations...')
    const listRes = await fetch('https://slack.com/api/conversations.list', {
      headers: { Authorization: `Bearer ${decryptedToken}` }
    })

    const listData = await listRes.json()
    if (!listData.ok) {
      console.error('[Slack API Error] conversations.list failed:', listData.error)
      return NextResponse.json({ error: listData.error }, { status: 500 })
    }

    logger.info('[Slack API] Channels found:', listData.channels.map((ch: SlackChannel) => ch.name))

    const feedbackChannel = (listData.channels as SlackChannel[]).find(
      (ch) => ch.name === 'user-feedback'
    )

    if (!feedbackChannel) {
      console.warn('[Slack API] Channel "user-feedback" not found.')
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    logger.info('[Slack API] Found channel ID for #user-feedback:', { channelId: feedbackChannel.id })

    // 3. Fetch channel messages
    logger.info('[Slack API] Fetching messages from channel...')
    const historyRes = await fetch(
      `https://slack.com/api/conversations.history?channel=${feedbackChannel.id}`,
      { headers: { Authorization: `Bearer ${decryptedToken}` } }
    )

    const historyData = await historyRes.json()
    logger.info('[Slack API] Raw history response:', historyData)

    if (historyData.error === 'not_in_channel') {
      console.warn('[Slack API] Bot is not in the channel.')
      return NextResponse.json({
        error: 'Bot is not a member of the channel. Use /invite @YourBotName in Slack.'
      }, { status: 400 })
    }

    if (historyData.error === 'missing_scope') {
      console.warn('[Slack API] Bot is missing required scope: channels:history.')
      return NextResponse.json({
        error: 'Missing channels:history scope. Reinstall the app after adding the scope.'
      }, { status: 400 })
    }

    if (!historyData.ok) {
      console.error('[Slack API Error] conversations.history failed:', historyData.error)
      return NextResponse.json({ error: historyData.error }, { status: 500 })
    }

    logger.info(`[Slack API] Retrieved ${historyData.messages.length} messages.`)
    return NextResponse.json({ messages: historyData.messages })
  } catch (err) {
    console.error('[GET] Unexpected error while fetching Slack messages:', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
