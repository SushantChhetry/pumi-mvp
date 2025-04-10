import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 1) GPT call helper
async function callGptApi(feedback: string): Promise<string> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY in environment')
    }

    // Build a system-style prompt
    const prompt = `
Role: Senior Product Manager
Task: Parse feedback into:
1. One-sentence summary
2. Tag (Bug, Feature, UX)
3. Urgency (Low/Medium/High)
4. Suggested next step
Rules:
- If "crash", "error", or "broken" => Tag=Bug, Urgency=High
- Format your answer like:
Summary: ...
Tag: ...
Urgency: ...
Next Step: ...
Feedback: "${feedback}"
`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo', // or 'gpt-4' if you have access
        messages: [
          {
            role: 'system',
            content: prompt
          }
        ]
      })
    })

    const data = await response.json()
    // Get GPT’s text output
    return data.choices?.[0]?.message?.content || ''
  } catch (err) {
    console.error('[GPT Error]', err)
    return ''
  }
}

// 2) Extract structured data from GPT response
function parseGptOutput(content: string) {
  // A simple approach with regex. Adjust as needed.
  const summaryMatch = /Summary:\s*(.*)/i.exec(content)
  const tagMatch = /Tag:\s*(.*)/i.exec(content)
  const urgencyMatch = /Urgency:\s*(.*)/i.exec(content)
  const nextStepMatch = /Next Step:\s*(.*)/i.exec(content)

  return {
    summary: summaryMatch?.[1]?.trim() || 'N/A',
    tag: tagMatch?.[1]?.trim() || 'N/A',
    urgency: urgencyMatch?.[1]?.trim() || 'N/A',
    nextStep: nextStepMatch?.[1]?.trim() || 'N/A'
  }
}

// 3) Build Slack blocks to display the parsed data
interface ParsedFeedback {
  summary: string;
  tag: string;
  urgency: string;
  nextStep: string;
}

function buildSlackBlocks(parsed: ParsedFeedback) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:rotating_light: *Summary*: ${parsed.summary}\n*Tag*: ${parsed.tag}\n*Urgency*: ${parsed.urgency}\n*Next Step*: ${parsed.nextStep}`
      }
    }
  ]
}

// 4) Post to Slack with blocks
async function sendSlackMessage(channel: string, blocks: SlackBlock[], token: string, fallbackText: string) {
  if (!token) {
    console.error('No Slack Bot Token found for this workspace.')
    return
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channel,
      text: fallbackText, // fallback text if blocks can’t be displayed
      blocks
    })
  })

  const data = await res.json()
  if (!data.ok) {
    console.error('Slack API error:', data.error)
  }
}

// Define the SlackBlock interface
interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // 1. Slack URL verification handshake
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge })
  }

  const event = body.event

  // 2. Only process non-bot user messages
  if (event?.type === 'message' && !event.bot_id) {
    const { user, text, channel, ts } = event
    const teamId = body.team_id // Slack includes team_id at top level

    console.log(`[Slack Message] (team=${teamId} channel=${channel}) [${user}] ${text} @ ${ts}`)

    // (A) Insert raw message into Supabase
    const { error: insertError } = await supabase.from('slack_messages').insert({
      slack_user_id: user,
      slack_channel_id: channel,
      text,
      message_ts: ts,
      team_id: teamId
    })
    if (insertError) {
      console.error('[Supabase Insert Error]', insertError)
    }

    // (B) Fetch the workspace record to get access_token & bot_user_id
    const { data: teamData, error: teamError } = await supabase
      .from('slack_teams')
      .select('access_token, bot_user_id')
      .eq('team_id', teamId)
      .single()

    if (teamError || !teamData) {
      console.error('[Supabase Fetch Team Error]', teamError)
      return NextResponse.json({ ok: true })
    }

    const { access_token, bot_user_id } = teamData

    // (C) Check if this text includes the bot’s user ID => user is mentioning the bot
    if (bot_user_id && text.includes(`<@${bot_user_id}>`)) {
      // --- MAIN GPT LOGIC ---

      // 1) Call GPT with the raw feedback (the entire text, minus the mention)
      //    or just the entire text, GPT can handle extra words.
      const gptRawOutput = await callGptApi(text)

      if (!gptRawOutput) {
        // If GPT fails, let user know
        await sendSlackMessage(channel, [], access_token, `⚠️ PuMi is busy. Try again later.`)
        return NextResponse.json({ ok: true })
      }

      // 2) Parse GPT’s output
      const parsed = parseGptOutput(gptRawOutput)
      console.log('[GPT Parsed]', parsed)

      // 3) Construct Slack blocks
      const blocks = buildSlackBlocks(parsed)

      // 4) Send a structured message back to Slack
      const fallbackText = `Feedback Summary: ${parsed.summary}`
      await sendSlackMessage(channel, blocks, access_token, fallbackText)
    }
  }

  return NextResponse.json({ ok: true })
}
