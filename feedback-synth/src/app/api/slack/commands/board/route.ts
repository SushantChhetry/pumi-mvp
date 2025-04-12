import { logger } from '@/lib/utils/logger'
import { NextRequest, NextResponse } from 'next/server'

// Set this to the public Notion page that holds the feedback database
const NOTION_FEEDBACK_BOARD_URL = 'https://notion.so/1d1e3307bb348085adcde44c076bff1b'


export async function POST(req: NextRequest) {
    logger.info('Received POST request for Slack command')

    const body = await req.text()
    logger.info('Request body parsed', { body })

    if (body.includes('ssl_check')) {
        return NextResponse.json({ ok: true })
      }

    const params = new URLSearchParams(body)
    const channelId = params.get('channel_id') || ''
    const responseUrl = params.get('response_url') || ''

    logger.info('Parsed parameters', { channelId, responseUrl })

    if (!channelId || !responseUrl) {
        console.info('Missing channel or response URL', { channelId, responseUrl })
        return NextResponse.json({ error: 'Missing channel or response URL' }, { status: 400 })
      }

    const message = {
        response_type: 'ephemeral', // Only visible to the user who triggered the slash command
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '📋 Here is your full feedback board in Notion:'
                }
            },
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'Open Feedback Board'
                        },
                        url: NOTION_FEEDBACK_BOARD_URL,
                        action_id: 'open_feedback_board'
                    }
                ]
            }
        ]
    }

    logger.info('Sending message to Slack response URL', { responseUrl, message })

    await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
    })

    logger.info('Message sent successfully to Slack response URL')

    return NextResponse.json({ ok: true })
}