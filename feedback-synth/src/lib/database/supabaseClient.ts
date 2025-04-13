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
        supabaseKey,
      })
    }

    this.client = createClient(supabaseUrl, supabaseKey)
    logger.info('Supabase client initialized')
  }

  async saveToPumiFeedback(entry: {
    type: 'bug' | 'feedback'
    summary: string
    details: string
    user_id: string
    channel_id: string
    metadata?: Record<string, unknown>
  }) {
    return await this.client.from('pumi_feedback').insert({
      ...entry,
      created_at: new Date().toISOString(),
    })
  }
  /**
   * Retrieves the Notion database ID for a given Slack team
   */
  async getNotionDbIdForTeam(teamId: string): Promise<string | null> {
    logger.info('[Supabase] getNotionDbIdForTeam called')

    if (!teamId || typeof teamId !== 'string') {
      logger.error('[Supabase] Invalid teamId provided to getNotionDbIdForTeam', { teamId })
      return null
    }

    try {
      const { data, error } = await this.client
        .from('notion_databases')
        .select('notion_db_id')
        .eq('team_id', teamId.trim())
        .single()

      if (error && error.code !== 'PGRST116') throw error

      logger.info('[Supabase] getNotionDbIdForTeam result', { data })

      return data?.notion_db_id ?? null
    } catch (error) {
      logger.error('[Supabase] Failed to fetch Notion DB ID for team', { teamId, error })
      throw new AppError('Failed to retrieve Notion DB ID', {
        teamId,
        originalError: error,
      })
    }
  }

  /**
   * Checks if a Slack event with the given event ID has already been processed
   * @param {string} eventId - The event ID to check
   * @returns {Promise<boolean>} true if the event has already been processed, false otherwise
   */
  async isDuplicateSlackEvent(eventId: string): Promise<boolean> {
    const result = await this.query<Array<{ event_id: string }>>('slack_events', 'select', {
      event_id: eventId,
    })
    return result && result.length > 0
  }

  /**
   * Marks a Slack event as processed in the database
   * @param {string} eventId - The event ID to mark as processed
   * @param {string} teamId - The Slack team ID to associate with the event
   * @returns {Promise<InsertResponse>} The result of the insert query
   */

  async markSlackEventProcessed(eventId: string, teamId: string) {
    return await this.query('slack_events', 'insert', [
      {
        event_id: eventId,
        team_id: teamId,
        processed_at: new Date().toISOString(),
      },
    ])
  }

  /**
   * Links a Notion database to a Slack team
   */
  async linkNotionDatabase(teamId: string, teamName: string, notionDbId: string): Promise<void> {
    try {
      const { error } = await this.client.from('notion_databases').insert({
        team_id: teamId,
        team_name: teamName,
        notion_db_id: notionDbId,
      })

      if (error) {
        logger.error('[Supabase] Failed to insert Notion DB record', { teamId, error })
        throw new AppError('Failed to link Notion DB', { teamId, notionDbId, originalError: error })
      }

      logger.info('[Supabase] Linked Notion DB to team successfully', { teamId, notionDbId })
    } catch (err) {
      logger.error('[SupabaseService] Unexpected error linking Notion DB', { err })
      throw err
    }
  }

  async insertUserFeedbackMessage(entry: {
    slack_team_id: string
    slack_user_id: string
    slack_channel_id: string
    text: string
    message_ts: string
    raw_event: unknown
  }) {
    try {
      const { data, error } = await this.client
        .from('user_feedback_messages')
        .insert(entry)
        .select()

      if (error) throw error

      logger.info('User feedback message stored', {
        messageId: data?.[0]?.id,
      })

      return data
    } catch (error) {
      logger.error('Failed to store user feedback message', { error })
      throw new AppError('Failed to insert user feedback message', {
        originalError: error,
      })
    }
  }

  /**
   * Stores a Slack message in the database
   */
  async insertMessage(message: SlackMessage) {
    try {
      const { data, error } = await this.client.from('slack_messages').insert(message).select()

      if (error) throw error

      logger.info('Message stored in Supabase', {
        messageId: data?.[0]?.id,
      })

      return data
    } catch (error) {
      logger.error('Failed to store Slack message', { error })
      throw new AppError('Failed to save message to database', {
        originalError: error,
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
        originalError: error,
      })
    }
  }

  /**
   * Generic query method for advanced Supabase operations
   */
  async query<T = unknown>(
    table: string,
    operation: 'select' | 'insert' | 'update' | 'delete',
    payload?: Record<string, unknown> | Array<Record<string, unknown>>,
  ) {
    try {
      let query
      switch (operation) {
        case 'select':
          query = this.client.from(table).select()
          break
        case 'insert':
          query = this.client.from(table).insert(payload)
          break
        case 'update':
          query = this.client.from(table).update(payload)
          break
        case 'delete':
          query = this.client.from(table).delete()
          break
        default:
          throw new AppError(`Unsupported operation: ${operation}`, { operation })
      }

      if (payload) {
        query = operation === 'select' && !Array.isArray(payload) ? query.match(payload) : query
      }

      const { data, error } = await query
      if (error) throw error

      return data as T
    } catch (error) {
      logger.error(`Supabase query failed on ${table}`, { operation, error })
      throw new AppError(`Database operation failed: ${operation}`, {
        table,
        operation,
        originalError: error,
      })
    }
  }
}

// Singleton instance setup
export const supabaseClient = new SupabaseService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
