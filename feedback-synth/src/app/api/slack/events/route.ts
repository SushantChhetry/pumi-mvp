import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Client as NotionClient } from '@notionhq/client'
import { parseISO, isValid, subDays } from 'date-fns'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

async function callGptApi(text: string, mode: 'parse' | 'query'): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY!
  const prompt =
    mode === 'parse'
      ? `Role: Senior Product Manager\nTask: Parse feedback into:\n1. One-sentence summary\n2. Tag (Bug, Feature, UX)\n3. Urgency (Low/Medium/High)\n4. Suggested next step\nRules:\n- If \"crash\", \"error\", or \"broken\" => Tag=Bug, Urgency=High\nFormat:\nSummary: ...\nTag: ...\nUrgency: ...\nNext Step: ...\nFeedback: \"${text}\"`
      : `Role: Notion Query Assistant\nTask: Convert natural language into structured Notion filters.\nReturn JSON with:\n- tag\n- urgency\n- flagged\n- date_range { from (ISO), to (ISO) }\nText: \"${text}\"`

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
  return data.choices?.[0]?.message?.content || ''
}

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
      text: `• *${p.properties.Name?.title?.[0]?.text?.content || 'Untitled'}*\nTag: ${p.properties.Tag?.select?.name} | Urgency: ${p.properties.Urgency?.select?.name}`
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

async function queryNotion(filters: any) {
  const CREATED_PROPERTY = 'Created'; // fallback default

  // Try to validate created property exists first
  try {
    const dbMeta = await notion.databases.retrieve({ database_id: process.env.NOTION_DB_ID! })
    const validKeys = Object.keys(dbMeta.properties)
    if (!validKeys.includes(CREATED_PROPERTY)) {
      const fallback = validKeys.find(key => dbMeta.properties[key].type === 'created_time')
      if (fallback) {
        CREATED_PROPERTY = fallback
        console.warn(`[Notion] Falling back to created_time field: "${CREATED_PROPERTY}"`)
      } else {
        console.warn(`[Notion] No created_time field found. Available properties:`, validKeys)
      }
    }
  } catch (metaErr) {
    console.error('[Notion] Failed to retrieve database metadata', metaErr)
  }
  const filterConditions = []
  if (filters.tag) filterConditions.push({ property: 'Tag', select: { equals: capitalize(filters.tag) } })
  if (filters.urgency) filterConditions.push({ property: 'Urgency', select: { equals: capitalize(filters.urgency) } })

  if (filters.date_range) {
    const { from, to } = filters.date_range
    if (isValidISODate(from) && isValidISODate(to)) {
      filterConditions.push({
        property: 'Created',
        date: { on_or_after: from, on_or_before: to }
      })
    } else {
      console.warn('[Invalid Date Range]', filters.date_range)
    }
  }

  const response = await notion.databases.query({
    database_id: process.env.NOTION_DB_ID!,
    filter: filterConditions.length ? { and: filterConditions } : undefined
  })

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

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge })
  }

  const event = body.event
  if (event?.type === 'message' && !event.bot_id) {
    const { user, text, channel, ts } = event
    const teamId = body.team_id

    await supabase.from('slack_messages').insert({
      slack_user_id: user,
      slack_channel_id: channel,
      text,
      message_ts: ts,
      team_id: teamId
    })

    const { data: teamData } = await supabase
      .from('slack_teams')
      .select('access_token, bot_user_id')
      .eq('team_id', teamId)
      .single()

    const { access_token, bot_user_id } = teamData || {}
    if (!access_token || !bot_user_id) return NextResponse.json({ ok: true })

    if (text.includes(`<@${bot_user_id}>`)) {
      const trimmedText = text.replace(`<@${bot_user_id}>`, '').trim()
      const debug = trimmedText.toLowerCase().includes('--debug')
      const cleanText = trimmedText.replace('--debug', '').trim()

      if (isQueryIntent(cleanText)) {
        const gptResponse = await callGptApi(cleanText, 'query')
        const filters = JSON.parse(gptResponse)
        if (debug) filters.__debug = true
        const results = await queryNotion(filters)
        const blocks = formatQueryResults(results, filters)
        await sendSlackMessage(channel, blocks, access_token, `Results for: ${cleanText}`)
      } else {
        const gptResponse = await callGptApi(cleanText, 'parse')
        const parsed = parseGptOutput(gptResponse)
        const blocks = buildSlackBlocks(parsed)
        await sendSlackMessage(channel, blocks, access_token, `Feedback Summary: ${parsed.summary}`)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
