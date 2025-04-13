import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { decrypt } from '@/lib/utils/crypto'
import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  logger.info('[Sync Users] Starting Slack user sync...')

  const { data: teams, error } = await supabase.from('slack_teams').select('*').limit(1)

  if (error || !teams?.length) {
    logger.error('[Supabase Error] Failed to fetch Slack bot token', { error })
    return NextResponse.json({ error: 'Slack bot token not found' }, { status: 500 })
  }

  const encryptedToken = teams[0].access_token
  const decryptedToken = decrypt(encryptedToken)
  logger.info('[Sync Users] Decrypted token and preparing to call Slack API', { team: teams[0].team_name })

  const slackRes = await fetch('https://slack.com/api/users.list', {
    headers: {
      Authorization: `Bearer ${decryptedToken}`
    }
  })

  const slackData = await slackRes.json()

  if (!slackData.ok) {
    logger.error('[Slack API Error] Failed to fetch users', { error: slackData.error })
    return NextResponse.json({ error: slackData.error || 'Failed to fetch users' }, { status: 500 })
  }

  interface SlackUser {
    id: string;
    profile: {
      display_name?: string;
    };
    real_name?: string;
    name: string;
  }

  const upserts = slackData.members.map((user: SlackUser) => ({
    id: user.id,
    name: user.profile.display_name || user.real_name || user.name
  }))

  logger.info(`[Sync Users] Preparing to upsert ${upserts.length} users into Supabase...`)

  const { error: insertError } = await supabase.from('slack_users').upsert(upserts)

  if (insertError) {
    logger.error('[Supabase Insert Error] Failed to upsert Slack users', { insertError })
    return NextResponse.json({ error: 'Failed to upsert users' }, { status: 500 })
  }

  logger.info('[Sync Users] Successfully synced Slack users', { count: upserts.length })

  return NextResponse.json({ count: upserts.length })
}
