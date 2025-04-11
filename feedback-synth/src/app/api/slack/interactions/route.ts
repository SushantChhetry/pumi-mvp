import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { Client as NotionClient } from '@notionhq/client'

const notion = new NotionClient({
  auth: process.env.NOTION_SECRET
})

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

  // Parse Slack payload (form-encoded)
  const payloadStr = decodeURIComponent(rawBody.split('payload=')[1] || '')
  const payload = JSON.parse(payloadStr)

  // Handle modal submission
  if (payload.type === 'view_submission' && payload.view?.callback_id === 'edit_feedback_modal') {
    const values = payload.view.state.values
    const summary = values.summary_block.summary_input.value
    const tag = values.tag_block.tag_input.value
    const urgency = values.urgency_block.urgency_input.value
    const nextStep = values.next_step_block.next_step_input.value

    await handleConfirm(payload, { summary, tag, urgency, nextStep })
    return NextResponse.json({ response_action: 'clear' }) // close the modal
  }

  // Handle button clicks
  if (payload.type === 'block_actions') {
    const action = payload.actions[0]
    const actionId = action.action_id
    const gptData = JSON.parse(action.value || '{}')

    switch (actionId) {
      case 'confirm_feedback':
        await handleConfirm(payload, gptData)
        break
      case 'edit_feedback':
        await handleEdit(payload, gptData)
        break
      case 'flag_feedback':
        await handleFlag(payload, gptData)
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

    const channel = payload.channel?.id || payload.container?.channel_id
    const userId = payload.user?.id
    if (channel && userId) {
      await postSlackMessage(channel, `✅ <@${userId}> Your feedback was saved to Notion!`)
    }
  } catch (err) {
    console.error('[Notion Insert Error]', err)
  }
}


async function handleEdit(payload: any, gptData: any) {
  const token = process.env.SLACK_BOT_TOKEN!
  const triggerId = payload.trigger_id

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
        callback_id: 'edit_feedback_modal',
        title: {
          type: 'plain_text',
          text: 'Edit Feedback'
        },
        blocks: [
          {
            type: 'input',
            block_id: 'summary_block',
            element: {
              type: 'plain_text_input',
              action_id: 'summary_input',
              initial_value: gptData.summary || ''
            },
            label: {
              type: 'plain_text',
              text: 'Summary'
            }
          },
          {
            type: 'input',
            block_id: 'tag_block',
            element: {
              type: 'plain_text_input',
              action_id: 'tag_input',
              initial_value: gptData.tag || ''
            },
            label: {
              type: 'plain_text',
              text: 'Tag'
            }
          },
          {
            type: 'input',
            block_id: 'urgency_block',
            element: {
              type: 'plain_text_input',
              action_id: 'urgency_input',
              initial_value: gptData.urgency || ''
            },
            label: {
              type: 'plain_text',
              text: 'Urgency'
            }
          },
          {
            type: 'input',
            block_id: 'next_step_block',
            element: {
              type: 'plain_text_input',
              action_id: 'next_step_input',
              initial_value: gptData.nextStep || ''
            },
            label: {
              type: 'plain_text',
              text: 'Next Step'
            }
          }
        ],
        submit: {
          type: 'plain_text',
          text: 'Save'
        }
      }
    })
  })
}

async function handleFlag(payload: any, gptData: any) {
  const adminChannel = process.env.SLACK_ADMIN_CHANNEL_ID || 'C01ABCXYZ'
  const userId = payload.user?.id

  await postSlackMessage(
    adminChannel,
    `🚩 <@${userId}> flagged a feedback:\n\n*Summary:* ${gptData.summary}\n*Tag:* ${gptData.tag}\n*Urgency:* ${gptData.urgency}`
  )
}
