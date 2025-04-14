import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'
import { encrypt } from '@/lib/utils/crypto'
import { createNotionDatabase, seedExampleTasks } from '@/lib/notion/createNotionDatabase'
import { supabaseClient } from '@/lib/database/supabaseClient'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  const baseUrl = process.env.SLACK_APP_BASE_URL || req.nextUrl.origin

  const welcomePageUrl = `https://energetic-mammal-703.notion.site/Welcome-to-PuMi-1d4e3307bb3480ad83effad21e00a999?pvs=4`

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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
        redirect_uri: process.env.SLACK_REDIRECT_URI!,
      }),
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

    const channelName = 'pumi-hub'
    logger.info(`[Slack] Creating channel: ${channelName}`)

    const createChannelRes = await fetch('https://slack.com/api/conversations.create', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: channelName, is_private: false }),
    })

    const createChannelData = await createChannelRes.json()
    let channelId = createChannelData?.channel?.id

    if (!createChannelData.ok) {
      if (createChannelData.error === 'name_taken') {
        logger.info('[Slack] Channel already exists, looking it up')

        const listRes = await fetch('https://slack.com/api/conversations.list', {
          method: 'GET',
          headers: { Authorization: `Bearer ${access_token}` },
        })
        const listData = await listRes.json()
        type SlackChannel = { id: string; name: string }
        channelId = listData.channels?.find((c: SlackChannel) => c.name === channelName)?.id
      } else {
        logger.error('[Channel Creation Error]', createChannelData)
      }
    } else {
      logger.info(`[Slack] Channel ${channelName} created successfully`)
    }

    logger.info(`[Slack OAuth] Successfully authenticated team: ${teamName} (${teamId})`)

    // Check if Notion DB already exists
    const { data: existingDb } = await supabase
      .from('notion_databases')
      .select('notion_db_id')
      .eq('team_id', teamId)
      .single()

    let notionDbId = existingDb?.notion_db_id

    if (!notionDbId) {
      try {
        notionDbId = await createNotionDatabase(teamName)
        logger.info('[Notion] Created Notion DB', { notionDbId })

        await supabaseClient.linkNotionDatabase(teamId, teamName, notionDbId)

        await seedExampleTasks(notionDbId)
        logger.info('[Notion] Seeded example tasks')
      } catch (err) {
        logger.error('[Callback] Failed during Notion DB setup', {
          err: err instanceof Error ? err.message : err,
        })
      }
    }

    const { error: upsertTeamError } = await supabase.from('slack_teams').upsert(
      {
        team_id: teamId,
        team_name: teamName,
        access_token: encryptedToken,
        bot_user_id,
        channel_id: channelId,
      },
      { onConflict: 'team_id' },
    )

    if (upsertTeamError) {
      logger.error('[Supabase Upsert Error]', upsertTeamError)
      return NextResponse.redirect(`${baseUrl}/?error=supabase_upsert_failed`)
    }

    logger.info(`[Database] Team ${teamName} (${teamId}) upserted successfully`)

    const userId = authed_user?.id
    let realName = 'pumi'

    if (userId) {
      const userInfoRes = await fetch('https://slack.com/api/users.info', {
        method: 'GET',
        headers: { Authorization: `Bearer ${access_token}` },
        next: { revalidate: 0 },
      })

      const userInfo = await userInfoRes.json()
      realName = userInfo?.user?.real_name?.toLowerCase() || 'pumi'

      await supabase.from('slack_users').upsert(
        {
          id: userId,
          name: realName,
          team_id: teamId,
        },
        { onConflict: 'id' },
      )

      logger.info(`[Database] User ${realName} (${userId}) upserted successfully`)
    }

    if (channelId && userId) {
      logger.info(`[Slack] Inviting user ${userId} to channel ${channelId}`)
      await fetch('https://slack.com/api/conversations.invite', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelId, users: userId }),
      })
    }

    if (channelId) {
      try {
        // 1. Welcome message
        logger.info(`[Slack] Posting welcome message to channel ${channelId}`)
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: channelId,
            text: '👋 Welcome to PuMi - Your Product Feedback Assistant!',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*👋 Welcome to PuMi!*\nI help teams collect, organize, and act on user feedback. I can automatically create tasks in Notion and provide insights about feedback trends.',
                },
              },
            ],
          }),
        })
        // Wait for a few seconds before sending the next message
        // 2. Channel setup instructions
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: channelId,
            text: 'Channel setup instructions',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*📌 Channel Setup*\nFor best results:\n1. Invite me to your `#user-feedback` channel\n2. In that channel, use `@PuMi bug:XYZ` or `@PuMi feedback:XYZ` to create tasks\n3. Use `/board` to get your Notion board link',
                },
              },
            ],
          }),
        })

        // 3. Current channel instructions
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: channelId,
            text: 'How to use this channel',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: "*💡 Using this channel (#pumi-hub)*\nHere you can simply type:\n• `bug: XYZ` (no @ needed)\n• `feedback: XYZ`\nI'll automatically create tasks in your board!",
                },
              },
            ],
          }),
        })

        // 4. Commands overview
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: channelId,
            text: 'Available commands',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*🛠 Available Commands*\n• `/summary` - Get recent feedback report\n• `/board` - Get your Notion board link\n• `/help` - Show these instructions again',
                },
              },
            ],
          }),
        })
      } catch (err) {
        logger.error(
          '[Slack Message Error]',
          err instanceof Error ? { message: err.message, stack: err.stack } : { error: err },
        )
      }
    }

    logger.info(`[Slack Bot Installed] Team: ${teamName} (${teamId})`)
    return NextResponse.redirect(welcomePageUrl)
  } catch (err) {
    logger.error(
      '[OAuth Callback Error]',
      err instanceof Error ? { message: err.message, stack: err.stack } : { error: err },
    )
    return NextResponse.redirect(`${baseUrl}/?error=unexpected_error`)
  }
}
