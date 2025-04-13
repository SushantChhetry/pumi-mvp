export async function fetchMessages(channelId: string, token: string) {
  const res = await fetch(`https://slack.com/api/conversations.history?channel=${channelId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return await res.json()
}

export async function getChannelId(token: string, channelName: string) {
  const res = await fetch('https://slack.com/api/conversations.list', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  const data = await res.json()
  return data.channels.find((c: { name: string; id: string }) => c.name === channelName)?.id
}
