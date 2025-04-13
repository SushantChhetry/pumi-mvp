import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function GET() {
  const { data, error } = await supabase.from('slack_users').select('id, name')

  if (error) {
    console.error('[Fetch Slack Users from Supabase]', error)
    return NextResponse.json({ error: 'Failed to fetch cached users' }, { status: 500 })
  }

  return NextResponse.json({ users: data })
}
