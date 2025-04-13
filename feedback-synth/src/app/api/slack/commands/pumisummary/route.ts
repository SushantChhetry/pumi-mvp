import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const body = await req.text() // Slack sends x-www-form-urlencoded
  const params = new URLSearchParams(body)

  const responseUrl = params.get('response_url')

  // Init Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  // 1. Respond immediately (Slack requires <3s)
  const ackResponse = NextResponse.json({
    response_type: 'ephemeral',
    text: 'Generating summary...',
  })

  // 2. Fetch summary (async)
  const { data: latest } = await supabase
    .from('slack_message_summaries')
    .select('summary')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const summary = latest?.summary || 'No summary available.'

  // 3. Post the result to response_url
  await fetch(responseUrl!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response_type: 'in_channel', // visible to others
      text: `🧠 *Latest Feedback Summary:*\n\n${summary}`,
    }),
  })

  return ackResponse
}
