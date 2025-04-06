

/**
 * 
 * File path: src/app/api/auth/slack/install/route.ts
 *
 * Handles the Slack OAuth installation process by redirecting the user to the Slack authorization URL.
 *
 * @param {NextRequest} req - The incoming HTTP GET request object.
 * @returns {Promise<NextResponse>} A response that redirects the user to the Slack OAuth installation URL.
 *
 * Environment Variables:
 * - SLACK_CLIENT_ID: The client ID for the Slack application.
 * - SLACK_REDIRECT_URI: The redirect URI configured for the Slack application.
 *
 * Scopes:
 * - channels:read
 * - channels:history
 * - chat:write
 * - groups:read
 * - groups:history
 * - im:read
 * - mpim:read
 * - users:read
 * - users.profile:read
 */
import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.SLACK_CLIENT_ID
  const redirectUri = process.env.SLACK_REDIRECT_URI
  const scopes = [
    'channels:read',
    'channels:history',
    'chat:write',
    'groups:read',
    'groups:history',
    'im:read',
    'mpim:read',
    'users:read',
    'users.profile:read'
  ].join(',')

  const slackInstallUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}`

  return NextResponse.redirect(slackInstallUrl)
}
