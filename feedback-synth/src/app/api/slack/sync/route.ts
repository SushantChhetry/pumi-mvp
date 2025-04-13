/**
 * POST /api/slack/sync
 *
 * This API route:
 * 1. Calls a helper function to fetch messages from a Slack channel (via `getSlackMessages()`).
 * 2. Upserts those messages into the `messages` table in Supabase.
 *
 * This is useful for manually or periodically syncing user feedback from Slack into your database
 * for analysis, trend reporting, or feeding into an AI model.
 */

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase' // Supabase client instance
import { getSlackMessages } from '@/lib/slack-utils'

// Define a custom type for a Slack message
type SlackMessage = {
  ts: string
  user: string
  text: string
  channel: string
  team: string
}

export async function POST() {
  try {
    // Fetch messages from Slack using your helper function
    const messages: SlackMessage[] = await getSlackMessages()

    // Upsert each message into the Supabase `messages` table
    for (const msg of messages) {
      const { error } = await supabase.from('messages').upsert({
        id: msg.ts, // Use Slack's timestamp as unique ID
        user_id: msg.user, // Slack user who sent the message
        text: msg.text, // Message content
        channel_id: msg.channel, // Slack channel ID
        ts: msg.ts, // Timestamp
        workspace_id: msg.team, // Slack team/workspace ID
      })

      if (error) {
        console.error('Error upserting message', msg, error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }
    }

    // Respond with a success message and the count of processed messages
    return NextResponse.json({ success: true, count: messages.length })
  } catch (err: unknown) {
    console.error('[POST /api/slack/sync] Error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
