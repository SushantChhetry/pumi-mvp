// File: lib/utils/sendReinstallDM.ts
import { decrypt } from '@/lib/utils/crypto'

// This function assumes you have the team record (including the stored encrypted user token)
// and the admin user's slack id (which you might have stored in your slack_users table).
interface Team {
  user_access_token?: string
}

export async function sendReinstallDM(team: Team, adminUser: { id: string }) {
  // Retrieve and decrypt the stored user token
  if (!team.user_access_token) {
    console.error('User token not available, cannot send reinstallation DM')
    return
  }
  const decryptedUserToken = decrypt(team.user_access_token)

  // Open a direct message conversation with the admin using conversations.open
  const openRes = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${decryptedUserToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ users: adminUser.id }),
  })
  const openData = await openRes.json()
  if (!openData.ok) {
    console.error('Failed to open DM:', openData.error)
    return
  }

  // Define the reinstallation link (this could be an environment variable)
  const reinstallUrl =
    process.env.SLACK_INSTALL_URL || 'https://your-domain.com/api/auth/slack/install'
  const message = `We noticed an issue with your Slack bot token. To restore full functionality, please reinstall the app using this link: ${reinstallUrl}`

  // Send the DM with the reinstallation link
  const dmRes = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${decryptedUserToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: openData.channel.id,
      text: message,
    }),
  })
  const dmData = await dmRes.json()
  if (!dmData.ok) {
    console.error('Failed to send DM:', dmData.error)
  }
}
