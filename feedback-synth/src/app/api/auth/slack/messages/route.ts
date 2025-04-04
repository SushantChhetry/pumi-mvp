// src/app/api/auth/slack/messages/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';

type SlackChannel = {
  id: string;
  name: string;
};

export async function GET() {
  console.log('[GET] Request received');

  const session = await getServerSession(authOptions);
  console.log('[GET] Session:', JSON.stringify(session, null, 2));

  const token = session?.accessToken;
  console.log('[GET] Slack access token:', token);

  if (!token) {
    console.log('[GET] No Slack access token found');
    return NextResponse.json(
      { error: 'No Slack access token found' },
      { status: 401 }
    );
  }

  try {
    console.log('[GET] Fetching Slack conversations list');
    const listRes = await fetch('https://slack.com/api/conversations.list', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listRes.json();
    console.log(
      '[GET] Raw conversations.list response:',
      JSON.stringify(listData, null, 2)
    );

    if (!listData.ok) {
      console.error(
        '[GET] Slack API error (conversations.list):',
        listData.error
      );
      return NextResponse.json(
        {
          error: 'Slack API error (conversations.list)',
          details: listData,
        },
        { status: 500 }
      );
    }

    console.log('[GET] Searching for "user-feedback" channel');
    const feedbackChannel =
      (listData.channels as SlackChannel[] | undefined)?.find(
        (ch: SlackChannel) => ch.name === 'user-feedback'
      );
    console.log('[GET] Feedback channel:', feedbackChannel);

    if (!feedbackChannel) {
      console.log('[GET] Channel "user-feedback" not found');
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    console.log(
      '[GET] Fetching Slack channel history for channel ID:',
      feedbackChannel.id
    );
    const historyRes = await fetch(
      `https://slack.com/api/conversations.history?channel=${feedbackChannel.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const historyData = await historyRes.json();
    console.log(
      '[GET] Raw conversations.history response:',
      JSON.stringify(historyData, null, 2)
    );

    if (!historyData.ok) {
      console.error(
        '[GET] Slack API error (conversations.history):',
        historyData.error
      );
      return NextResponse.json(
        {
          error: 'Slack API error (conversations.history)',
          details: historyData,
        },
        { status: 500 }
      );
    }

    console.log('[GET] Returning messages as JSON');
    return NextResponse.json({ messages: historyData.messages });
  } catch (err: unknown) {
    console.error('[Slack Fetch Error]', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch messages: ${errorMessage}` },
      { status: 500 }
    );
  }
}
