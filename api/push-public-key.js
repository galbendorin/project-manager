import { applyApiCors } from './_auth.js';
import { getWebPushPublicKey, isWebPushConfigured } from './_webPush.js';

export default async function handler(req, res) {
  applyApiCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isWebPushConfigured()) {
    return res.status(503).json({ error: 'Background alerts are not configured yet.' });
  }

  return res.status(200).json({
    ok: true,
    publicKey: getWebPushPublicKey(),
  });
}
