'use client'

import { useEffect, useState } from 'react'

interface SlackMessage {
  id: string
  text: string
  slack_user_id: string
  created_at: string
}

export default function RawMessagesPage() {
  const [messages, setMessages] = useState<SlackMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchMessages() {
      try {
        const res = await fetch('/api/slack/messages/raw')
        const data = await res.json()

        if (!res.ok) throw new Error(data.error || 'Failed to fetch messages.')

        setMessages(data.messages)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchMessages()
  }, [])

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Raw Slack Messages (Latest 50)</h1>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
        {messages.map((msg) => (
          <li key={msg.id} style={{ marginBottom: '1.5rem' }}>
            <strong>{msg.slack_user_id}</strong> @ {new Date(msg.created_at).toLocaleString()}
            <p style={{ marginTop: '0.25rem' }}>{msg.text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
