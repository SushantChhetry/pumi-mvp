// src/lib/database/supabaseClient.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../utils/logger'
import { AppError } from '../errors'

interface SlackMessage {
  slack_user_id: string
  slack_channel_id: string
  text: string
  message_ts: string
  team_id: string
}

interface SlackTeamData {
  access_token: string
  bot_user_id: string
}

export class SupabaseService {
  private readonly client: SupabaseClient

  constructor(supabaseUrl: string, supabaseKey: string) {
    if (!supabaseUrl || !supabaseKey) {
      throw new AppError('Supabase credentials not configured', {
        supabaseUrl,
        supabaseKey
      })
    }

    this.client = createClient(supabaseUrl, supabaseKey)
    logger.info('Supabase client initialized')
  }

  async saveToPumiFeedback(entry: {
    type: 'bug' | 'feedback',
    summary: string,
    details: string,
    user_id: string,
    channel_id: string,
    metadata?: Record<string, any>
  }) {
    return await this.client.from('pumi_feedback').insert({
      ...entry,
      created_at: new Date().toISOString()
    })
  }

  /**
   * Stores a Slack message in the database
   */
  async insertMessage(message: SlackMessage) {
    try {
      const { data, error } = await this.client
        .from('slack_messages')
        .insert(message)
        .select()

      if (error) throw error

      logger.info('Message stored in Supabase', {
        messageId: data?.[0]?.id
      })
      
      return data
    } catch (error) {
      logger.error('Failed to store Slack message', { error })
      throw new AppError('Failed to save message to database', {
        originalError: error
      })
    }
  }

  /**
   * Retrieves Slack team credentials from the database
   */
  async getSlackTeamData(teamId: string): Promise<SlackTeamData | null> {
    try {
      const { data, error } = await this.client
        .from('slack_teams')
        .select('access_token, bot_user_id')
        .eq('team_id', teamId)
        .single()

      if (error && error.code !== 'PGRST116') throw error // Ignore 'No rows found' error

      return data
    } catch (error) {
      logger.error('Failed to fetch Slack team data', { teamId, error })
      throw new AppError('Failed to retrieve Slack credentials', {
        teamId,
        originalError: error
      })
    }
  }

  /**
   * Generic query method for advanced Supabase operations
   */
  async query<T = any>(
    table: string,
    operation: 'select' | 'insert' | 'update' | 'delete',
    payload?: any
  ) {
    try {
      let query;
      switch (operation) {
        case 'select':
          query = this.client.from(table).select();
          break;
        case 'insert':
          query = this.client.from(table).insert(payload);
          break;
        case 'update':
          query = this.client.from(table).update(payload);
          break;
        case 'delete':
          query = this.client.from(table).delete();
          break;
        default:
          throw new AppError(`Unsupported operation: ${operation}`, { operation });
      }

      if (payload) {
        query = operation === 'select' 
          ? query.match(payload)
          : query
      }

      const { data, error } = await query
      if (error) throw error

      return data as T
    } catch (error) {
      logger.error(`Supabase query failed on ${table}`, { operation, error })
      throw new AppError(`Database operation failed: ${operation}`, {
        table,
        operation,
        originalError: error
      })
    }
  }
}

// Singleton instance setup
export const supabaseClient = new SupabaseService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)