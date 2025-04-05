import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data: teams, error } = await supabase.from('slack_teams').select('*').limit(1)

  if (error || !teams?.length) {
    return NextResponse.json({ error: 'Slack bot token not found' }, { status: 500 })
  }

  const token = teams[0].access_token

  const slackRes = await fetch('https://slack.com/api/users.list', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  const slackData = await slackRes.json()

  if (!slackData.ok) {
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

  const { error: insertError } = await supabase.from('slack_users').upsert(upserts)

  if (insertError) {
    console.error('[Supabase Insert Error]', insertError)
    return NextResponse.json({ error: 'Failed to upsert users' }, { status: 500 })
  }

  return NextResponse.json({ count: upserts.length })
}
