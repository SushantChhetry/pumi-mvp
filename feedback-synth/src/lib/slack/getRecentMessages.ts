// src/lib/slack/getRecentMessages.ts
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'
import dayjs from 'dayjs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * Gets recent Slack messages from a specific channel over the last N days
 */
export async function getRecentMessages(channelId: string, days = 7) {
  const fromDate = dayjs().subtract(days, 'day').toISOString()

  logger.info('[FeedbackDigest] Querying messages', { channelId, fromDate })

  const { data, error } = await supabase
    .from('slack_messages')
    .select('text, slack_user_id, message_ts')
    .eq('slack_channel_id', channelId)
    .gte('created_at', fromDate)
    .order('message_ts', { ascending: true })

  if (error) {
    logger.error('[FeedbackDigest] Failed to fetch messages', { error })
    return []
  }

  logger.info('[FeedbackDigest] Fetched messages', { count: data.length })

  return data
}
