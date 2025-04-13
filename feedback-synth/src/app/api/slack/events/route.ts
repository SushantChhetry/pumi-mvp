// src/app/api/slack/events/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/utils/logger'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Handle Slack URL verification challenge
    if (body.type === 'url_verification') {
      return NextResponse.json({ challenge: body.challenge })
    }

    const event = body.event

    if (event && event.type === 'message' && !event.bot_id) {
      const { user, text, ts, channel } = event

      logger.info('[Slack] New message received', { user, text, ts, channel })

      const { error } = await supabaseAdmin.from('user_feedback_messages').insert({
        slack_user_id: user,
        slack_channel_id: channel,
        text,
        message_ts: ts,
        raw_event: event
      })

      if (error) {
        logger.error('[Supabase] Failed to store Slack message', { error })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error('Failed to process Slack event', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
