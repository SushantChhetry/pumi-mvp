// src/app/api/slack/commands/help/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/utils/logger'
import { matchRelevantDocs } from '@/lib/ai/matchNotionDocs'

export async function POST(req: NextRequest) {
  const payload = await req.formData()
  const question = payload.get('text') as string
  if (!question || question.trim().length === 0) {
    return NextResponse.json({
      response_type: 'ephemeral',
      text: "Please include a question like `/help how do I tag PuMi?`"
    })
  }
  const userId = payload.get('user_id') as string

  logger.info('[Slack /help] Received question', { question, userId })

  // Find relevant pages
  const matches = await matchRelevantDocs(question)

  if (!matches.length) {
    return NextResponse.json({ text: "Sorry! I couldn't find anything helpful for that." })
  }

interface Match {
    title: string;
    url: string;
}

const blocks: { type: string; text: { type: string; text: string } }[] = matches.slice(0, 3).map((doc: Match) => ({
    type: 'section',
    text: {
        type: 'mrkdwn',
        text: `*${doc.title}*\n<${doc.url}>`
    }
}));

  return NextResponse.json({
    response_type: 'ephemeral',
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `🔍 *Here's what I found:*` } },
      ...blocks
    ]
  })
}
