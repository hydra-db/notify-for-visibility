export async function postSlack(token: string, channel: string, text: string): Promise<void> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
  })
  // Slack reports most failures as HTTP 200 with ok: false.
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok || !body.ok) {
    throw new Error(`Slack chat.postMessage failed: ${body.error ?? `HTTP ${res.status}`}`)
  }
}
