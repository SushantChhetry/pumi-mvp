/**
 * @file notionEmbedUploader.ts
 *
 * This script is responsible for uploading help documentation from a Notion database
 * to a Supabase table. It fetches pages from a specified Notion database, processes
 * their content, generates embeddings using OpenAI's embedding model, and stores the
 * data in a Supabase table for further use.
 *
 * The script performs the following tasks:
 * - Initializes clients for Notion, Supabase, and OpenAI embeddings.
 * - Fetches pages from a Notion database using the Notion API.
 * - Extracts the title and full content of each page.
 * - Generates embeddings for the page content using OpenAI's embedding model.
 * - Inserts the processed data (title, content, URL, and embedding) into a Supabase table.
 * - Logs detailed information and errors during the process for debugging and monitoring.
 *
 * Environment variables required:
 * - `NOTION_SECRET`: API key for authenticating with the Notion API.
 * - `NOTION_HELP_DOC_DB_ID`: ID of the Notion database containing help documentation.
 * - `NEXT_PUBLIC_SUPABASE_URL`: URL of the Supabase instance.
 * - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public API key for accessing Supabase.
 *
 * Dependencies:
 * - `@notionhq/client`: For interacting with the Notion API.
 * - `@supabase/supabase-js`: For interacting with the Supabase database.
 * - `@langchain/openai`: For generating embeddings using OpenAI's embedding model.
 * - `dotenv`: For loading environment variables from a `.env` file.
 * - `@/lib/utils/logger`: Custom logger utility for structured logging.
 *
 * Functions:
 * - `uploadNotionHelpDocs`: Main function that orchestrates the upload process.
 * - `getTitleFromPage`: Extracts the title from a Notion page object.
 * - `getFullPageText`: Fetches and concatenates the full text content of a Notion page.
 *
 * Usage:
 * - Ensure all required environment variables are set.
 * - Run the script to upload Notion help documentation to Supabase.
 */
import dotenv from 'dotenv'
dotenv.config()

// src/scripts/notionEmbedUploader.ts
import { Client } from '@notionhq/client'
import { createClient } from '@supabase/supabase-js'
import { OpenAIEmbeddings } from '@langchain/openai'
import { logger } from '@/lib/utils/logger'
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'

const notion = new Client({ auth: process.env.NOTION_SECRET })
logger.info('Initialized Supabase client', {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Provided' : 'Not Provided',
})
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

logger.info('Initializing OpenAI Embeddings', { modelName: 'text-embedding-3-small' })
const embeddings = new OpenAIEmbeddings({ modelName: 'text-embedding-3-small' })

logger.info('Setting Notion Database ID', { databaseId: process.env.NOTION_HELP_DOC_DB_ID })
const NOTION_DATABASE_ID = process.env.NOTION_HELP_DOC_DB_ID!

export async function uploadNotionHelpDocs() {
  try {
    logger.info('Starting upload of Notion help docs')

    const pages = await notion.databases.query({ database_id: NOTION_DATABASE_ID })
    logger.info('Fetched pages from Notion database', { count: pages.results.length })

    for (const page of pages.results) {
      // Skip partial responses
      if (!('properties' in page)) {
        logger.info('Skipping non-page object response', { id: page.id })
        continue
      }

      const id = page.id
      const title = getTitleFromPage(page as PageObjectResponse)
      logger.info('Processing page', { id, title })

      const content = await getFullPageText(id)
      if (!content) {
        logger.info('Skipping page with no content', { id, title })
        continue
      }

      const embedding = await embeddings.embedQuery(content)
      logger.info('Generated embedding for page', { id, title })

      const { error } = await supabase.from('notion_help_docs').insert({
        title,
        page_content: content,
        url: `https://www.notion.so/${id.replace(/-/g, '')}`,
        embedding,
      })

      if (error) {
        logger.error('Failed to insert notion doc', { title, error })
      } else {
        logger.info('Inserted notion doc', { title })
      }
    }

    logger.info('Completed upload of Notion help docs')
  } catch (err) {
    logger.error('Failed to upload notion help docs', { error: err })
  }
}

function getTitleFromPage(page: PageObjectResponse): string {
  const titleProp = Object.values(page.properties).find(
    (prop: PageObjectResponse['properties'][string]) => prop.type === 'title',
  )
  return (titleProp as { title: { plain_text: string }[] })?.title?.[0]?.plain_text || 'Untitled'
}

async function getFullPageText(pageId: string): Promise<string> {
  logger.info('Fetching full page text', { pageId })

  const blocks = await notion.blocks.children.list({ block_id: pageId })
  logger.info('Fetched blocks for page', {
    pageId,
    blockCount: blocks.results.length,
  })

  const lines: string[] = []

  for (const block of blocks.results) {
    if (!('type' in block)) continue

    const contentBlock = block as any
    const blockType = contentBlock.type

    if (contentBlock[blockType]?.rich_text) {
      const line = contentBlock[blockType].rich_text
        .map((textObj: any) => textObj.plain_text)
        .join('')
      if (line.trim()) lines.push(line)
    }
  }

  return lines.join('\n')
}

uploadNotionHelpDocs()
