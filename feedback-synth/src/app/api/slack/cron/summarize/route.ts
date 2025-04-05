import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

  // 1. Fetch past month's messages
  const { data: messages, error } = await supabase
    .from('slack_messages')
    .select('text')
    .gte('created_at', oneMonthAgo.toISOString())

  if (error) {
    console.error('[Supabase Fetch Error]', error)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }

  if (!messages || messages.length === 0) {
    return NextResponse.json({ message: 'No messages to summarize' })
  }

  // 2. Combine messages
  const combinedText = messages.map((m) => m.text).join('\n').trim()

  if (combinedText.length < 20) {
    return NextResponse.json({ message: 'Not enough content to summarize meaningfully.' })
  }

  // 3. Use OpenAI to summarize
  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4', // or 'gpt-3.5-turbo'
        messages: [
          {
            role: 'system',
            content:
              'You are a product feedback synthesizer. Create a clear, concise summary of themes, suggestions, or concerns from the Slack feedback below. If too short, say: "Not enough messages to summarize."'
          },
          {
            role: 'user',
            content: `Here are Slack messages collected over the past month:\n\n${combinedText}`
          }
        ]
      })
    })

    const openaiData = await openaiRes.json()

    const summary = openaiData.choices?.[0]?.message?.content?.trim()

    if (!summary) {
      console.error('[OpenAI Error]', openaiData)
      return NextResponse.json({ error: 'Failed to summarize messages' }, { status: 500 })
    }

    // 4. Store summary (optional)
    const { error: insertError } = await supabase
      .from('slack_message_summaries')
      .insert({ summary })

    if (insertError) {
      console.error('[Supabase Insert Error]', insertError)
    }

    return NextResponse.json({ summary })
  } catch (err) {
    console.error('[Unexpected Error]', err)
    return NextResponse.json({ error: 'Unexpected error during summarization' }, { status: 500 })
  }
}
