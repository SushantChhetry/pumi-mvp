// src/app/api/slack/events/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/utils/logger'
import { SlackEventHandler } from './slackEventHandler'
import { SupabaseService } from '@/lib/database/supabaseClient'

const supabase = new SupabaseService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    logger.info('[Slack] Received a new request')

    const body = await req.json()
    logger.info('[Slack] Parsed request body', { body })

    if (body.type === 'url_verification') {
      logger.info('[Slack] URL verification challenge received', { challenge: body.challenge })
      return NextResponse.json({ challenge: body.challenge })
    }

    const handler = new SlackEventHandler(body, supabase)
    return await handler.processEvent()
  } catch (error) {
    logger.error('[Slack] Event handling failed', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
