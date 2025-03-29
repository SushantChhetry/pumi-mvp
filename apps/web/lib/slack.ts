const { SLACK_BOT_TOKEN, SLACK_CHANNEL_ID } = process.env;

export async function fetchSlackMessages() {
  const res = await fetch("https://slack.com/api/conversations.history", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: SLACK_CHANNEL_ID,
      limit: 100
    }),
  });

  const data = await res.json();
  return data.messages || [];
}
