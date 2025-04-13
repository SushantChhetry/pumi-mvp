// app/api/summarize-feedback/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET() {
  try {
    // Fetch recent messages from last 60 seconds
    const { data: messages, error } = await supabase
      .from('user_feedback_messages')
      .select('*')
      .gte('created_at', new Date(Date.now() - 60_000).toISOString())

    if (error) throw error

    // TODO: Implement summarization
    // const summary = await summarize(messages.map(m => m.text))

    return NextResponse.json({
      success: true,
      message_count: messages.length,
      // summary
    })
    
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error('Error:', err.message)
    } else {
      console.error('Error:', err)
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic' // Ensure fresh data