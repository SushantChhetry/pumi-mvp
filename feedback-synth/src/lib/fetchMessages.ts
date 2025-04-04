export async function fetchMessages(channelId: string, token: string) {
    const res = await fetch(`https://slack.com/api/conversations.history?channel=${channelId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    return await res.json()
  }
  
  export async function getChannelId(token: string, channelName: string) {
    const res = await fetch('https://slack.com/api/conversations.list', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    const data = await res.json()
    return data.channels.find((c: any) => c.name === channelName)?.id
  }
  