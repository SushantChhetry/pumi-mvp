import { NextResponse } from 'next/server'
import { logger } from '@/lib/utils/logger'
import { SupabaseService } from '@/lib/database/supabaseClient'
import { SlackEventBody } from '@/lib/types'
import { SlackEventHandler } from './slackEventHandler'

export class SlackEventProcessor {
  private readonly body: SlackEventBody
  private readonly supabase: SupabaseService

  constructor(body: SlackEventBody, supabase: SupabaseService) {
    this.body = body
    this.supabase = supabase
  }

  async handleEvent() {
    try {
      logger.info('Handling Slack event', { eventType: this.body.type })
  
      if (this.body.type === 'url_verification') {
        logger.info('Responding to Slack URL verification')
        return NextResponse.json({ challenge: this.body.challenge })
      }
  
      if (this.body.event?.type !== 'message' || this.body.event?.bot_id) {
        logger.info('Ignoring non-message event or bot message')
        return NextResponse.json({ ok: true })
      }
  
      const handler = new SlackEventHandler(this.body, this.supabase)
      return await handler.processEvent()
    } catch (error) {
      logger.error('Slack event handling failed', { error })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
  
}