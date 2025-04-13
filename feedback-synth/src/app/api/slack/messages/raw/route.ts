import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get('days') || 7)
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - days)

  const { data, error } = await supabase
    .from('slack_messages')
    .select('*')
    .gte('created_at', sinceDate.toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Supabase Fetch Error]', error)
    return NextResponse.json({ error: 'Could not load messages' }, { status: 500 })
  }

  return NextResponse.json({ messages: data })
}
