// File: api/slack/cron/health-check/route.ts

/**  NOTE: Depending on your hosting provider 
 * (for example, Vercel or Netlify), you can schedule 
 * this endpoint to run periodically (e.g., using a serverless 
 * cron job or an external scheduler like GitHub Actions hitting this endpoint).*/

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'
import { decrypt } from '@/lib/utils/crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // Retrieve all teams from the database
  const { data: teams, error } = await supabaseAdmin
    .from('slack_teams')
    .select('*')

  if (error) {
    logger.error('Failed to fetch teams for health check', { error })
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 })
  }

  // Iterate over teams and validate their token
  for (const team of teams) {
    try {
      // Decrypt the stored access token before using it
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
        logger.error(`Health check failed for team ${team.team_name}`, { result })
        // Here you might update your team record, e.g., flag it as inactive
        await supabaseAdmin
          .from('slack_teams')
          .update({ access_token: null /* or use an "is_active" flag */ })
          .eq('team_id', team.team_id)
      } else {
        logger.info(`Team ${team.team_name} token is valid`)
      }
    } catch (err) {
      logger.error(`Unexpected error during token health check for team ${team.team_name}`, { err })
    }
  }

  return NextResponse.json({ ok: true })
}
