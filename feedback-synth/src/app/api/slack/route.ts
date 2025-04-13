import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encrypt } from '@/lib/utils/crypto' 

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  if (!code) {
    return NextResponse.redirect('/?error=no_code')
  }

  // Exchange code for access token from Slack
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

  if (!access_token || !team?.id || !bot_user_id) {
    return NextResponse.redirect('/?error=missing_slack_data')
  }

  const encryptedToken = encrypt(access_token) // Encrypt before storing

  // Store workspace-level install securely
  const { error } = await supabase.from('slack_teams').upsert(
    {
      team_id: team.id,
      team_name: team.name,
      bot_user_id,
      access_token: encryptedToken
    },
    { onConflict: 'team_id' }
  )

  if (error) {
    console.error('[Supabase Upsert Error]', error)
    return NextResponse.redirect('/?error=supabase_error')
  }

  return NextResponse.redirect('/messages')
}
