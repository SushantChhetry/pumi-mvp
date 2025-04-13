// src/app/api/auth/slack/install/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'
import { encrypt } from '@/lib/utils/crypto'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  const baseUrl = process.env.SLACK_APP_BASE_URL || req.nextUrl.origin

  if (error) {
    logger.error('[Slack OAuth Error]', { error })
    return NextResponse.redirect(`${baseUrl}/?error=${error}`)
  }

  if (!code) {
    logger.info('[Slack OAuth] Missing code in callback')
    return NextResponse.redirect(`${baseUrl}/?error=missing_code`)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  try {
    logger.info('[Slack OAuth] Exchanging code for access token')
    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        redirect_uri: process.env.SLACK_REDIRECT_URI!
      })
    })

    const tokenData = await tokenRes.json()

    if (!tokenData.ok) {
      logger.error('[Slack OAuth Failed]', tokenData)
      return NextResponse.redirect(`${baseUrl}/?error=slack_oauth_failed`)
    }

    const { access_token, team, bot_user_id, authed_user } = tokenData
    const encryptedToken = encrypt(access_token)

    const teamId = team?.id
    const teamName = team?.name

    if (!access_token || !teamId || !bot_user_id) {
      logger.error('[Slack OAuth Missing Fields]', { access_token, teamId, bot_user_id })
      return NextResponse.redirect(`${baseUrl}/?error=missing_oauth_data`)
    }

    // === Create or reuse #pumi-hub channel BEFORE upserting ===
    const channelName = 'pumi-hub'
    logger.info(`[Slack] Creating channel: ${channelName}`)

    const createChannelRes = await fetch('https://slack.com/api/conversations.create', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: channelName, is_private: false })
    })

    const createChannelData = await createChannelRes.json()
    let channelId = createChannelData?.channel?.id

    if (!createChannelData.ok) {
      if (createChannelData.error === 'name_taken') {
        logger.info('[Slack] Channel already exists, looking it up')

        const listRes = await fetch('https://slack.com/api/conversations.list', {
          method: 'GET',
          headers: { Authorization: `Bearer ${access_token}` }
        })
        const listData = await listRes.json()
        type SlackChannel = { id: string; name: string };
        channelId = listData.channels?.find((c: SlackChannel) => c.name === channelName)?.id
      } else {
        logger.error('[Channel Creation Error]', createChannelData)
      }
    } else {
      logger.info(`[Slack] Channel ${channelName} created successfully`)
    }

    // === Now safe to use channelId in your upsert ===
    logger.info(`[Slack OAuth] Successfully authenticated team: ${teamName} (${teamId})`)

    const { error: upsertTeamError } = await supabase.from('slack_teams').upsert(
      {
        team_id: teamId,
        team_name: teamName,
        access_token: encryptedToken,
        bot_user_id,
        channel_id: channelId
      },
      { onConflict: 'team_id' }
    )

    if (upsertTeamError) {
      logger.error('[Supabase Upsert Error]', upsertTeamError)
      return NextResponse.redirect(`${baseUrl}/?error=supabase_upsert_failed`)
    }

    logger.info(`[Database] Team ${teamName} (${teamId}) upserted successfully`)

    // Get user info
    const userId = authed_user?.id
    let realName = 'pumi'

    if (userId) {
      const userInfoRes = await fetch('https://slack.com/api/users.info', {
        method: 'GET',
        headers: { Authorization: `Bearer ${access_token}` },
        next: { revalidate: 0 }
      })

      const userInfo = await userInfoRes.json()
      realName = userInfo?.user?.real_name?.toLowerCase() || 'pumi'

      await supabase.from('slack_users').upsert(
        {
          id: userId,
          name: realName,
          team_id: teamId
        },
        { onConflict: 'id' }
      )

      logger.info(`[Database] User ${realName} (${userId}) upserted successfully`)
    }

    // Invite user to the channel (optional)
    if (channelId && userId) {
      logger.info(`[Slack] Inviting user ${userId} to channel ${channelId}`)
      await fetch('https://slack.com/api/conversations.invite', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelId, users: userId })
      })
    }

    // Post onboarding message
    if (channelId) {
      logger.info(`[Slack] Posting onboarding message to channel ${channelId}`)
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channelId,
          text: '👋 Welcome to PuMi! Here’s how to get started:',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*👋 Welcome to PuMi!* Your product feedback assistant is ready to go.'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '1. Try `/summary` to get a report of recent feedback\n' +
                      '2. Mention `@PuMi-MVP` and send feedback using `feedback:`\n' +
                      '3. Use `query:` to explore issues and trends\n\n' +
                      '_Need help? Just reply in this channel._'
              }
            }
          ]
        })
      })
    }

    logger.info(`[Slack Bot Installed] Team: ${teamName} (${teamId})`)
    return NextResponse.redirect(`${baseUrl}/messages`)
  } catch (err) {
    logger.error('[OAuth Callback Error]', err instanceof Error
      ? { message: err.message, stack: err.stack }
      : { error: err }
    )
    return NextResponse.redirect(`${baseUrl}/?error=unexpected_error`)
  }
}
