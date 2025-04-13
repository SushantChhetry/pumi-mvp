// src/app/api/slack/events/messageIngestor.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const body = await req.json()
  const event = body.event

  if (!event || event.type !== 'message' || event.subtype === 'bot_message') {
    return NextResponse.json({ ok: true, message: 'Ignored non-user message' })
  }

  try {
    const { user, text, ts, channel, thread_ts, edited, blocks } = event

    logger.info('[Slack Ingest] Capturing message', { user, text, ts, channel })

    const { error } = await supabase.from('company_feedback_messages').insert({
      slack_user_id: user,
      message_ts: ts,
      thread_ts: thread_ts ?? ts,
      text,
      channel_id: channel,
      is_edited: !!edited,
      raw_blocks: blocks,
      captured_at: new Date().toISOString(),
    })

    if (error) {
      logger.error('[Supabase] Failed to insert feedback message', { error })
      return NextResponse.json({ ok: false }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error('[Slack Ingest] Error processing message', {
      error: err instanceof Error ? err.message : err,
    })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
