import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    console.error('[Slack OAuth Error]', error)
    return NextResponse.redirect(`/?error=${error}`)
  }

  if (!code) {
    return NextResponse.redirect('/?error=missing_code')
  }

  // Initialize Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  try {
    // Exchange the code for a bot token
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        redirect_uri: process.env.SLACK_REDIRECT_URI! // Must match what you configured in Slack
      })
    })

    const data = await response.json()

    if (!data.ok) {
      console.error('[Slack OAuth Failed]', data)
      return NextResponse.redirect('/?error=slack_oauth_failed')
    }

    const { access_token, team, bot_user_id } = data

    // Save the bot token and workspace info to Supabase
    const { error: dbError } = await supabase.from('slack_teams').upsert({
      team_id: team.id,
      team_name: team.name,
      access_token,
      bot_user_id
    })

    if (dbError) {
      console.error('[Supabase Upsert Error]', dbError)
      return NextResponse.redirect('/?error=supabase_upsert_failed')
    }

    console.log(`[Slack Bot Installed] Team: ${team.name} (${team.id})`)
    return NextResponse.redirect('/messages')
  } catch (err) {
    console.error('[OAuth Callback Error]', err)
    return NextResponse.redirect('/?error=unexpected_error')
  }
}
