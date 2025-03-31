'use client';

import { signIn, signOut, useSession } from "next-auth/react";

export default function HomePage() {
  const { data: session } = useSession();

  return (
    <main className="p-4">
      {!session ? (
        <button onClick={() => signIn('slack')}>Sign in with Slack</button>
      ) : (
        <>
          <p>Signed in as {session.user?.email}</p>
          <button onClick={() => signOut()}>Sign out</button>
        </>
      )}
    </main>
  );
}
