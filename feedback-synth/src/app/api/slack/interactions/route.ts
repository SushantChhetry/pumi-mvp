import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { Client as NotionClient } from '@notionhq/client'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const notion = new NotionClient({ auth: process.env.NOTION_SECRET })

export async function POST(request: NextRequest) {
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET!
  const timestamp = request.headers.get('x-slack-request-timestamp')!
  const rawBody = await request.text()
  const sigBaseString = `v0:${timestamp}:${rawBody}`
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', slackSigningSecret)
    .update(sigBaseString, 'utf8')
    .digest('hex')
  const slackSignature = request.headers.get('x-slack-signature')!

  if (!secureCompare(mySignature, slackSignature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payloadStr = decodeURIComponent(rawBody.split('payload=')[1] || '')
  const payload = JSON.parse(payloadStr)

  if (payload.type === 'view_submission') {
    if (payload.view?.callback_id === 'edit_feedback_modal') {
      const values = payload.view.state.values
      const summary = values.summary_block.summary_input.value
      const tag = values.tag_block.tag_input.selected_option.value
      const urgency = values.urgency_block.urgency_input.selected_option.value
      const nextStep = values.next_step_block.next_step_input.value
      const pageId = payload.view?.private_metadata

      await handleConfirm(payload, { summary, tag, urgency, nextStep, pageId })
      return NextResponse.json({ response_action: 'clear' })
    }

    if (payload.view?.callback_id === 'flag_reason_modal') {
      const reason = payload.view.state.values.reason_block.reason_input.value
      const gptData = JSON.parse(payload.view.private_metadata || '{}')
      await handleFlagSubmission(payload, gptData, reason)
      return NextResponse.json({ response_action: 'clear' })
    }
  }

  if (payload.type === 'block_actions') {
    const action = payload.actions[0]
    const actionId = action.action_id
    const gptData = JSON.parse(action.value || '{}')
    const teamId = payload.team?.id || payload.team_id

    const { data: teamData } = await supabase
      .from('slack_teams')
      .select('access_token')
      .eq('team_id', teamId)
      .single()

    if (!teamData?.access_token) {
      console.error('[Missing Slack bot token]')
      return NextResponse.json({ error: 'Missing bot token' }, { status: 500 })
    }

    switch (actionId) {
      case 'confirm_feedback':
        await handleConfirm(payload, gptData)
        break
      case 'edit_feedback':
        await handleEdit(payload, gptData, teamData.access_token)
        break
      case 'flag_feedback':
        await handleFlag(payload, gptData, teamData.access_token)
        break
      default:
        console.log('Unknown action:', actionId)
    }
  }

  return NextResponse.json({ ok: true })
}

function secureCompare(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

async function postSlackMessage(channel: string, text: string) {
  const token = process.env.SLACK_BOT_TOKEN!
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ channel, text })
  })
}

function cleanText(text: string): string {
  return decodeURIComponent((text || '').replace(/\+/g, ' '))
}

async function handleConfirm(payload: any, gptData: any) {
  console.log('[Confirming Feedback]', gptData)

  try {
    const summary = cleanText(gptData.summary)
    const tag = cleanText(gptData.tag || 'Other')
    const urgency = cleanText(gptData.urgency || 'Medium')
    const nextStep = cleanText(gptData.nextStep)
    const pageId = gptData.pageId || payload.view?.private_metadata

    if (pageId) {
      await notion.pages.update({
        page_id: pageId,
        properties: {
          Name: {
            title: [{ text: { content: summary } }]
          },
          Tag: {
            select: { name: tag }
          },
          Urgency: {
            select: { name: urgency }
          },
          NextStep: {
            rich_text: [{ text: { content: nextStep } }]
          }
        }
      })
    } else {
      await notion.pages.create({
        parent: { database_id: process.env.NOTION_DB_ID! },
        properties: {
          Name: {
            title: [{ text: { content: summary } }]
          },
          Tag: {
            select: { name: tag }
          },
          Urgency: {
            select: { name: urgency }
          },
          NextStep: {
            rich_text: [{ text: { content: nextStep } }]
          }
        }
      })
    }

    const channel = payload.channel?.id || payload.container?.channel_id
    const userId = payload.user?.id
    if (channel && userId) {
      await postSlackMessage(channel, `✅ <@${userId}> Your feedback was saved to Notion!`)
    }
  } catch (err) {
    console.error('[Notion Insert/Update Error]', err)
  }
}

async function handleEdit(payload: any, gptData: any, token: string) {
  console.log('[handleEdit] called with:', gptData)

  const triggerId = payload.trigger_id
  if (!triggerId) {
    console.error('[handleEdit] Missing trigger_id')
    return
  }

  const res = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'edit_feedback_modal',
        private_metadata: gptData.pageId || '',
        title: { type: 'plain_text', text: 'Edit Feedback' },
        blocks: [
          {
            type: 'input',
            block_id: 'summary_block',
            element: {
              type: 'plain_text_input',
              action_id: 'summary_input',
              initial_value: cleanText(gptData.summary || '')
            },
            label: { type: 'plain_text', text: 'Summary' }
          },
          {
            type: 'input',
            block_id: 'tag_block',
            label: { type: 'plain_text', text: 'Tag' },
            element: {
              type: 'static_select',
              action_id: 'tag_input',
              initial_option: {
                text: { type: 'plain_text', text: cleanText(gptData.tag || 'Feature') },
                value: cleanText(gptData.tag || 'Feature')
              },
              options: [
                { text: { type: 'plain_text', text: 'Bug' }, value: 'Bug' },
                { text: { type: 'plain_text', text: 'Feature' }, value: 'Feature' },
                { text: { type: 'plain_text', text: 'UX' }, value: 'UX' },
                { text: { type: 'plain_text', text: 'Other' }, value: 'Other' }
              ]
            }
          },
          {
            type: 'input',
            block_id: 'urgency_block',
            label: { type: 'plain_text', text: 'Urgency' },
            element: {
              type: 'static_select',
              action_id: 'urgency_input',
              initial_option: {
                text: { type: 'plain_text', text: cleanText(gptData.urgency || 'Medium') },
                value: cleanText(gptData.urgency || 'Medium')
              },
              options: [
                { text: { type: 'plain_text', text: 'Low' }, value: 'Low' },
                { text: { type: 'plain_text', text: 'Medium' }, value: 'Medium' },
                { text: { type: 'plain_text', text: 'High' }, value: 'High' }
              ]
            }
          },
          {
            type: 'input',
            block_id: 'next_step_block',
            element: {
              type: 'plain_text_input',
              action_id: 'next_step_input',
              initial_value: cleanText(gptData.nextStep || '')
            },
            label: { type: 'plain_text', text: 'Next Step' }
          }
        ],
        submit: { type: 'plain_text', text: 'Save' }
      }
    })
  })

  const data = await res.json()
  if (!data.ok) {
    console.error('[Slack Modal Error]', data)
  } else {
    console.log('[Modal opened successfully]', data)
  }
}

async function handleFlag(payload: any, gptData: any, token: string) {
  const triggerId = payload.trigger_id
  if (!triggerId) {
    console.error('[handleFlag] Missing trigger_id')
    return
  }

  await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'flag_reason_modal',
        private_metadata: JSON.stringify(gptData),
        title: { type: 'plain_text', text: 'Flag Feedback' },
        submit: { type: 'plain_text', text: 'Submit' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'input',
            block_id: 'reason_block',
            label: {
              type: 'plain_text',
              text: 'Why are you flagging this?'
            },
            element: {
              type: 'plain_text_input',
              multiline: true,
              action_id: 'reason_input',
              placeholder: {
                type: 'plain_text',
                text: 'e.g. wrong tag, not relevant, unclear summary...'
              }
            }
          }
        ]
      }
    })
  })
}

async function handleFlagSubmission(payload: any, gptData: any, reason: string) {
  const userId = payload.user?.id
  const channel = payload.channel?.id || payload.container?.channel_id
  const adminChannel = process.env.SLACK_ADMIN_CHANNEL_ID || 'C01ABCXYZ'

  const { error } = await supabase.from('flagged_feedback').insert({
    slack_user_id: userId,
    slack_channel_id: channel,
    summary: cleanText(gptData.summary),
    tag: cleanText(gptData.tag),
    urgency: cleanText(gptData.urgency),
    next_step: cleanText(gptData.nextStep),
    page_id: gptData.pageId || null,
    reason: cleanText(reason)
  })

  if (error) {
    console.error('[Flag Insert Error]', error)
  }

  await postSlackMessage(
    adminChannel,
    `🚩 <@${userId}> flagged a feedback with reason:\n>*${reason}*\n\n*Summary:* ${gptData.summary}\n*Tag:* ${gptData.tag}\n*Urgency:* ${gptData.urgency}`
  )
}
