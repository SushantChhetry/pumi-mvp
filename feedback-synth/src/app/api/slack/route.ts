import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  if (!code) return NextResponse.redirect('/?error=no_code')

  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      redirect_uri: process.env.SLACK_REDIRECT_URI!
    }).toString()
  })

  const data = await res.json()

  if (!data.ok) {
    console.error('Slack OAuth failed', data)
    return NextResponse.redirect('/?error=slack_oauth_failed')
  }

  const { access_token, team, bot_user_id } = data

  // Store workspace-level install
  await supabase.from('slack_teams').upsert({
    team_id: team.id,
    team_name: team.name,
    bot_user_id,
    access_token
  })

  return NextResponse.redirect('/messages')
}
