import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.SLACK_CLIENT_ID
  const redirectUri = process.env.SLACK_REDIRECT_URI
  const scopes = [
    'commands',
    'chat:write',
    'users:read',
    'channels:read',
    'groups:read',
    'im:read',
    'mpim:read'
  ].join(',')

  const slackOAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}`

  return NextResponse.redirect(slackOAuthUrl)
}
