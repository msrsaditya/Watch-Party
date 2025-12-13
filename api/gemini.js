export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const keyString = process.env.GEMINI_KEYS;
  if (!keyString) {
    return res.status(500).json({ error: 'Server Configuration Error: Missing Keys' });
  }
  const apiKeys = keyString.split(',').map(k => k.trim());
  const { prompt, systemInstruction } = req.body;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined
  };
  async function attemptFetch(key) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        throw new Error('RETRY');
      }
      const errorText = await response.text();
      throw new Error(`API Error: ${response.statusText} - ${errorText}`);
    }
    return await response.json();
  }
  let attempts = 0;
  const maxAttempts = 3;
  while (attempts < maxAttempts) {
    const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    try {
      const data = await attemptFetch(randomKey);
      return res.status(200).json(data);
    } catch (e) {
      attempts++;
      if (e.message === 'RETRY') continue;
      console.error(e);
      return res.status(500).json({ error: 'AI Service Error' });
    }
  }
  return res.status(429).json({ error: 'All API attempts exhausted.' });
}
