// src/app/api/slack/cron/digest/route.ts
import { NextResponse } from 'next/server'
import { getRecentMessages } from '@/lib/slack/getRecentMessages'
import { formatSlackMessages } from '@/lib/slack/formatSlackMessages'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'
import { summarizeText } from '@/lib/ai/summarize'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  const channelId = process.env.SLACK_FEEDBACK_CHANNEL_ID! // fallback to a known ID

  try {
    const messages = await getRecentMessages(channelId, 7)
    if (!messages.length) {
      logger.warn('[DigestCron] No messages found')
      return NextResponse.json({ ok: true, message: 'No messages to digest' })
    }

    const formatted = formatSlackMessages(messages)
    const summary = await summarizeText(formatted)

    const { error } = await supabase.from('pumi_feedback_digests').insert({
      channel_id: channelId,
      summary,
      raw_text: formatted,
      message_count: messages.length,
    })

    if (error) {
      logger.error('[DigestCron] Failed to store digest', { error })
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    logger.error(
      '[DigestCron] Unexpected error',
      err instanceof Error ? { message: err.message, stack: err.stack } : { error: err },
    )
    return NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 })
  }
}
