import { Client } from '@notionhq/client'
import { logger } from '../utils/logger'
import { NotionError } from '../errors'
import { config } from '../config'
import { Validators } from '../utils/validators'
import { ParsedFeedback } from '../types'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role key required for inserts from the backend
)

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)

export class NotionService {
  private readonly client: Client
  private readonly dbId: string

  constructor() {
    this.client = new Client({ auth: process.env.NOTION_SECRET })
    this.dbId = config.notion.dbId
  }

  async queryDatabase(filters: any) {
    try {
      logger.info('Querying Notion database', { filters })
      
      const response = await this.client.databases.query({
        database_id: this.dbId,
        filter: this.buildFilters(filters)
      })
      logger.info('Notion returned pages', { count: response.results.length })

      return response.results
    } catch (error) {
      logger.error('Notion query failed', { error })
      throw new NotionError('Failed to query Notion database', { originalError: error })
    }
  }
  async createFeedbackTask(parsed: ParsedFeedback, options?: { source?: string; metadata?: any }) {
    try {
      const response = await this.client.pages.create({
        parent: {
          database_id: this.dbId
        },
        properties: {
          Name: {
            title: [
              {
                text: {
                  content: parsed.summary
                }
              }
            ]
          },
          Tag: {
            select: {
              name: parsed.tag
            }
          },
          Urgency: {
            select: {
              name: parsed.urgency
            }
          },
          NextStep: {
            rich_text: [
              {
                text: {
                  content: parsed.nextStep
                }
              }
            ]
          }
        }
      })
      const { error } = await supabase.from('feedback_tasks').insert({
        external_id: response.id,
        summary: parsed.summary,
        tag: parsed.tag,
        urgency: parsed.urgency,
        next_step: parsed.nextStep,
        source: options?.source || 'Slack',
        destination: 'Notion',
        metadata: options?.metadata || {}
      })

      if (error) {
        logger.error('Failed to store feedback task in Supabase', { error })
      } else {
        logger.info('Stored feedback task in Supabase')
      }

  
      logger.info('Feedback task created in Notion', { pageId: response.id })
      return response
    } catch (error) {
      logger.error('Failed to create feedback task in Notion', { error })
      throw new NotionError('Failed to create Notion page', { originalError: error })
    }
  }

  private buildFilters(rawFilters: any) {
    const filters = []
    
    if (rawFilters.tag) {
      filters.push({
        property: 'Tag',
        select: { equals: capitalize(rawFilters.tag) }
      })
    }

    if (rawFilters.urgency) {
      filters.push({
        property: 'Urgency',
        select: { equals: rawFilters.urgency }
      })
    }

    if (rawFilters.date_range) {
      const { from, to } = rawFilters.date_range
      if (Validators.isValidISODate(from) && Validators.isValidISODate(to)) {
        filters.push({
          property: 'Created Date',
          date: { on_or_after: from, on_or_before: to }
        })
      }
    }

    return filters.length ? { and: filters } : undefined
  }
}

