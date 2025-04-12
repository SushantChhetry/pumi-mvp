// src/app/api/slack/commands/help/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/utils/logger'
import { getHelpAnswer } from '@/lib/ai/helpEngine'
import { verifySlackRequest } from '@/lib/slack/verifySlackRequest'
import { sendEphemeralResponse } from '@/lib/slack/slackMessages'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const isVerified = await verifySlackRequest(req, body)

    if (!isVerified) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = new URLSearchParams(body)
    const question = params.get('text') ?? ''
    const responseUrl = params.get('response_url') ?? ''

    logger.info('[Slack /help] Received command', { question })

    const answer = await getHelpAnswer(question)

    await sendEphemeralResponse(responseUrl, {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Q:* ${question}\n\n*Answer:*
${answer}`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '💡 Powered by PuMi knowledge base'
            }
          ]
        }
      ]
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error('[Slack /help] Failed to handle request', { error })
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
