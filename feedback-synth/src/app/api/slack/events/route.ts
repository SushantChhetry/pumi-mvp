import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Client as NotionClient } from '@notionhq/client'
import { parseISO, isValid } from 'date-fns'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Initialize Notion client
const notion = new NotionClient({ auth: process.env.NOTION_SECRET! })

function isQueryIntent(text: string): boolean {
  const queryTriggers = ['show me', 'list', 'which', 'find', 'what are']
  return queryTriggers.some((t) => text.toLowerCase().includes(t))
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

function isValidISODate(date: string) {
  return isValid(parseISO(date))
}

/**
 * Calls OpenAI’s Chat Completion API with two modes:
 * 1. "parse": parse user feedback into summary, tag, urgency, next step
 * 2. "query": parse user query into structured filters
 */
async function callGptApi(text: string, mode: 'parse' | 'query'): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY!
  const prompt =
  mode === 'parse'
    ? `Role: Senior Product Manager
Task: Parse feedback into:
1. One-sentence summary
2. Tag (Bug, Feature, UX)
3. Urgency (Low/Medium/High)
4. Suggested next step
Rules:
- If "crash", "error", or "broken" => Tag=Bug, Urgency=High
Format:
Summary: ...
Tag: ...
Urgency: ...
Next Step: ...
Feedback: "${text}"`
    : `Role: Notion Query Assistant
Task: Convert the following natural language into structured Notion filters.
Return JSON with keys:
- tag
- urgency
- flagged
- date_range: { from (ISO), to (ISO) }

Important rules:
- If the user says "bugs" (plural) or "bug," always output "bug" (singular) in the "tag" field.
- Do not use synonyms like "Bugs," "Bugs:", or "Issue." Always use "bug."
- Urgency can be "Low," "Medium," or "High" only.

Text: "${text}"
`


  console.log(`[callGptApi] Mode: ${mode}, user text: "${text}"`)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || ''

  console.log(`[callGptApi] GPT raw response:`, JSON.stringify(data, null, 2))
  console.log(`[callGptApi] Extracted content: "${content}"`)

  return content
}

/**
 * Extracts “Summary: ...”, “Tag: ...”, “Urgency: ...”, “Next Step: ...”
 * from GPT response in parse mode
 */
function parseGptOutput(content: string) {
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

interface ParsedFeedback {
  summary: string
  tag: string
  urgency: string
  nextStep: string
}

/**
 * Builds an interactive Slack block message with the parsed feedback data
 */
function buildSlackBlocks(parsed: ParsedFeedback) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:rotating_light: *Summary*: ${parsed.summary}\n*Tag*: ${parsed.tag}\n*Urgency*: ${parsed.urgency}\n*Next Step*: ${parsed.nextStep}`
      }
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✅ Confirm' },
          style: 'primary',
          value: JSON.stringify(parsed),
          action_id: 'confirm_feedback'
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '✏️ Edit' },
          value: JSON.stringify(parsed),
          action_id: 'edit_feedback'
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '🚩 Flag' },
          style: 'danger',
          value: JSON.stringify(parsed),
          action_id: 'flag_feedback'
        }
      ]
    }
  ]
}

/**
 * Formats Notion query results into Slack blocks.
 */
function formatQueryResults(pages: any[], filters?: any): any[] {
  if (!pages.length) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: 'No matching feedback found.' }
      }
    ]
  }

  const blocks = pages.map((p) => ({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `• *${p.properties.Name?.title?.[0]?.text?.content || 'Untitled'}*\nTag: ${
        p.properties.Tag?.select?.name
      } | Urgency: ${p.properties.Urgency?.select?.name}`
    }
  }))

  if (filters?.__debug) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `\`Filters: ${JSON.stringify(filters)}\``
        }
      ]
    })
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `\`Results: ${pages.length} entries\``
        }
      ]
    })
  }

  return blocks
}

/**
 * Queries Notion with GPT-generated filters. 
 * If date_range is present, filters by "Created Date" (type=Date).
 */
async function queryNotion(filters: any) {
  const filterConditions = []

  if (filters.tag) {
    filterConditions.push({
      property: 'Tag',
      select: { equals: capitalize(filters.tag) }
    })
  }

  if (filters.urgency) {
    filterConditions.push({
      property: 'Urgency',
      select: { equals: capitalize(filters.urgency) }
    })
  }

  // If there's a date range, filter on "Created Date" (must exist in DB)
  if (filters.date_range) {
    const { from, to } = filters.date_range
    if (isValidISODate(from) && isValidISODate(to)) {
      filterConditions.push({
        property: 'Created Date',
        date: {
          on_or_after: from,
          on_or_before: to
        }
      })
    } else {
      console.warn('[Invalid Date Range]', filters.date_range)
    }
  }

  // Log what filters we ended up with
  console.log('[queryNotion] Filter conditions:', JSON.stringify(filterConditions, null, 2))

  const response = await notion.databases.query({
    database_id: process.env.NOTION_DB_ID!,
    filter: filterConditions.length ? { and: filterConditions } : undefined
  })

  console.log('[queryNotion] Notion returned', response.results.length, 'pages.')
  return response.results
}

async function sendSlackMessage(channel: string, blocks: any[], token: string, fallbackText: string) {
  if (!token) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ channel, text: fallbackText, blocks })
  })
}

/**
 * Main Slack Events endpoint.
 */
export async function POST(req: NextRequest) {
  // Parse the incoming request body
  const body = await req.json()
  console.log('[POST /api/slack/events] Incoming body:', JSON.stringify(body, null, 2))

  // Slack URL verification handshake
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge })
  }

  const event = body.event
  if (event?.type === 'message' && !event.bot_id) {
    const { user, text, channel, ts } = event
    const teamId = body.team_id

    // Log the raw text from Slack
    console.log('[POST /api/slack/events] User text:', text)
    console.log('[POST /api/slack/events] User ID:', user, 'Channel:', channel, 'Team:', teamId)

    // Store in Supabase (optional)
    await supabase.from('slack_messages').insert({
      slack_user_id: user,
      slack_channel_id: channel,
      text,
      message_ts: ts,
      team_id: teamId
    })

    // Retrieve Slack bot access token
    const { data: teamData } = await supabase
      .from('slack_teams')
      .select('access_token, bot_user_id')
      .eq('team_id', teamId)
      .single()

    const { access_token, bot_user_id } = teamData || {}
    if (!access_token || !bot_user_id) {
      console.warn('[POST /api/slack/events] No Slack token or bot_user_id found')
      return NextResponse.json({ ok: true })
    }

    // Only respond if user mentions our bot
    if (text.includes(`<@${bot_user_id}>`)) {
      const trimmedText = text.replace(`<@${bot_user_id}>`, '').trim()
      const debug = trimmedText.toLowerCase().includes('--debug')
      const cleanText = trimmedText.replace('--debug', '').trim()

      console.log('[POST /api/slack/events] Bot was mentioned.')
      console.log('[POST /api/slack/events] debug:', debug, 'cleanText:', cleanText)

      // If user likely wants a query (like “show me…”)
      if (isQueryIntent(cleanText)) {
        console.log('[POST /api/slack/events] Interpreting user text as a query.')

        // Ask GPT to parse text into filters
        const gptResponse = await callGptApi(cleanText, 'query')
        console.log('[POST /api/slack/events] GPT query response:', gptResponse)

        // For safety, wrap in try/catch in case GPT’s JSON is malformed
        let filters = {}
        try {
          filters = JSON.parse(gptResponse)
        } catch (err) {
          console.error('[POST /api/slack/events] Failed to parse GPT response as JSON:', err)
        }

        if (debug) filters.__debug = true

        // Query Notion
        const results = await queryNotion(filters)

        // Format Slack blocks
        const blocks = formatQueryResults(results, filters)
        // Send Slack message
        await sendSlackMessage(channel, blocks, access_token, `Results for: ${cleanText}`)

      } else {
        console.log('[POST /api/slack/events] Interpreting user text as feedback to parse.')

        // We parse feedback
        const gptResponse = await callGptApi(cleanText, 'parse')
        console.log('[POST /api/slack/events] GPT parse response:', gptResponse)

        const parsed = parseGptOutput(gptResponse)
        console.log('[POST /api/slack/events] Parsed feedback object:', parsed)

        const blocks = buildSlackBlocks(parsed)
        await sendSlackMessage(channel, blocks, access_token, `Feedback Summary: ${parsed.summary}`)
      }
    }
  }

  // Return a basic Slack-friendly response
  return NextResponse.json({ ok: true })
}
