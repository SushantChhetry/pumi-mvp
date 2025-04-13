'use client'

import Link from 'next/link'

export default function HomePage() {
  return (
    <Link
      href="/api/auth/slack/install"
      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded"
    >
      Add to Slack
    </Link>
  )
}
