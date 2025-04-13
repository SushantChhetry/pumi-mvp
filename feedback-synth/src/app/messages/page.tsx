'use client'

import { useEffect, useState } from 'react'

interface SlackMessage {
  id?: string
  text: string
}

interface FetchMessagesResponse {
  messages: SlackMessage[]
  error?: string
}

export default function SlackMessagesPage() {
  const [messages, setMessages] = useState<SlackMessage[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchMessages() {
      try {
        const res = await fetch('/api/slack/messages')
        const data: FetchMessagesResponse = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch messages.')
        }

        setMessages(data.messages)
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('An unknown error occurred.')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchMessages()
  }, [])

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Slack Feedback</h1>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!loading && messages.length === 0 && <p>No messages found.</p>}
      <ul>
        {messages.map((msg, index) => (
          <li key={msg.id || index}>{msg.text}</li>
        ))}
      </ul>
    </div>
  )
}
