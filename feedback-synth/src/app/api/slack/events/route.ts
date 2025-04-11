import { NextRequest, NextResponse } from 'next/server'
import { SlackEventProcessor } from './slackEventProcessor'
import { SupabaseService } from '../../../../lib/database/supabaseClient'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

const supabase = new SupabaseService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const processor = new SlackEventProcessor(body, supabase)
    return await processor.handleEvent()
  } catch (error) {
    logger.error('Failed to process request', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}