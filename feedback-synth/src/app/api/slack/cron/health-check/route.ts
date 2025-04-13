import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'
import { decrypt } from '@/lib/utils/crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data: teams, error } = await supabaseAdmin
    .from('slack_teams')
    .select('*')

  if (error) {
    logger.error('Failed to fetch teams for health check', { error })
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 })
  }

  for (const team of teams) {
    try {
      const decryptedToken = decrypt(team.access_token)

      const response = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${decryptedToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      const result = await response.json()

      if (!result.ok) {
        logger.error(`Token invalid for team ${team.team_name}`, { result })

        // Mark access token as invalid
        await supabaseAdmin
          .from('slack_teams')
          .update({ access_token: null }) // or: is_active: false
          .eq('team_id', team.team_id)

        // Post to pumi-hub if we have the channel ID
        const reinstallUrl = process.env.SLACK_INSTALL_URL || 'https://your-domain.com/api/auth/slack/install'

        if (team.channel_id) {
          const reinstallMessage = `⚠️ *Heads up!* Your PuMi bot token is no longer valid. Please reinstall the app to restore full functionality: ${reinstallUrl}`

          const dmRes = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${decryptedToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              channel: team.channel_id,
              text: reinstallMessage
            })
          })

          const dmData = await dmRes.json()
          if (!dmData.ok) {
            logger.error(`Failed to notify pumi-hub in ${team.team_name}`, { error: dmData.error })
          } else {
            logger.info(`Reinstall notice sent to #pumi-hub for team ${team.team_name}`)
          }
        } else {
          logger.warn(`No channel_id found for team ${team.team_name}, skipping pumi-hub notification`)
        }
      } else {
        logger.info(`✅ Team ${team.team_name} token is valid`)
      }
    } catch (err) {
      logger.error(`Unexpected error during token check for team ${team.team_name}`, { err })
    }
  }

  return NextResponse.json({ ok: true })
}
