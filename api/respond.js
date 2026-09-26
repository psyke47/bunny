// Vercel serverless function: /api/respond
// Stores Sisipho's answer once (locked after the first save) and pings
// a Telegram bot the moment it's saved.
//
// Requires these env vars, set in Vercel → Settings → Environment Variables:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID

const KEY = 'sisipho_answer';

async function redisGet(key) {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;
  const r = await fetch(`${UPSTASH_REDIS_REST_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }
  });
  const data = await r.json();
  return data.result || null;
}

async function redisSet(key, value) {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;
  await fetch(`${UPSTASH_REDIS_REST_URL}/set/${key}/${encodeURIComponent(value)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }
  });
}

async function notifyTelegram(answer) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const text = answer === 'yes' ? 'Sisipho said YES 🎉' : 'Sisipho answered: no.';
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
  });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const existing = await redisGet(KEY);
      return res.status(200).json({ answered: !!existing, answer: existing });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      const answer = body && body.answer;

      if (answer !== 'yes' && answer !== 'no') {
        return res.status(400).json({ error: 'answer must be "yes" or "no"' });
      }

      const existing = await redisGet(KEY);
      if (existing) {
        // Already answered once — never overwrite, just return what was saved.
        return res.status(200).json({ answer: existing, locked: true });
      }

      await redisSet(KEY, answer);
      await notifyTelegram(answer);
      return res.status(200).json({ answer, locked: false });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'something went wrong', detail: String(err) });
  }
}
