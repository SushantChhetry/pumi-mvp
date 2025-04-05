'use client'

import { useEffect, useState } from 'react'

interface SlackMessage {
  id: string
  text: string
  slack_user_id: string
  slack_channel_id: string
  created_at: string
}

interface SlackUserMap {
  [userId: string]: string
}

export default function RawMessagesPage() {
  const [messages, setMessages] = useState<SlackMessage[]>([])
  const [usernames, setUsernames] = useState<SlackUserMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(7)
  const [search, setSearch] = useState('')
  const [summary, setSummary] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null

    async function fetchMessages() {
      try {
        if (!loading) setRefreshing(true)

        const res = await fetch(`/api/slack/messages/raw?days=${days}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to fetch messages.')
        setMessages(data.messages)
        setSummary(null)

        const usersRes = await fetch('/api/slack/users')
        const usersData = await usersRes.json()
        if (usersRes.ok) {
          const userMap: SlackUserMap = {}
          usersData.users.forEach((user: { id: string; name: string }) => {
            userMap[user.id] = user.name
          })
          setUsernames(userMap)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

    fetchMessages()

    intervalId = setInterval(fetchMessages, 100000)

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [days])

  const filteredMessages = messages.filter((msg) =>
    msg.text.toLowerCase().includes(search.toLowerCase())
  )

  const handleSummarize = async () => {
    const res = await fetch('/api/slack/cron/summarize')
    const data = await res.json()
    setSummary(data.summary || data.message || 'No summary returned.')
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Slack Messages</h1>

      <div style={{ marginBottom: '1rem' }}>
        <label>
          Show messages from last:
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ marginLeft: '0.5rem' }}
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>

        <input
          type="text"
          placeholder="Search by keyword..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginLeft: '1rem', padding: '4px' }}
        />

        <button onClick={handleSummarize} style={{ marginLeft: '1rem', padding: '4px 8px' }}>
          Summarize
        </button>

        {refreshing && <span style={{ marginLeft: '1rem' }}>🔄 Refreshing...</span>}
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {summary && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#f9f9f9' }}>
          <h3>Summary:</h3>
          <p>{summary}</p>
        </div>
      )}

      <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
        {Object.entries(
          filteredMessages.reduce((acc, msg) => {
            acc[msg.slack_channel_id] ||= []
            acc[msg.slack_channel_id].push(msg)
            return acc
          }, {} as Record<string, SlackMessage[]>)
        ).map(([channelId, group]) => (
          <li key={channelId} style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Channel: {channelId}</h3>
            <ul>
              {group.map((msg) => (
                <li key={msg.id} style={{ marginBottom: '1rem' }}>
                  <strong>@{usernames[msg.slack_user_id] || msg.slack_user_id}</strong> @{' '}
                  {new Date(msg.created_at).toLocaleString()}
                  <p style={{ marginTop: '0.25rem' }}>{msg.text}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
