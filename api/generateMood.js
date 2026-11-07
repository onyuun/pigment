const GEMINI_MODEL = 'gemini-1.5-flash';
const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed.slice(1).split('').map((digit) => digit + digit).join('')}`.toUpperCase();
  }
  return HEX_PATTERN.test(trimmed) ? trimmed.toUpperCase() : null;
}

function sendJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function extractPalette(text) {
  if (typeof text !== 'string') throw new Error('Gemini returned no palette text.');
  const jsonText = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (_error) {
    throw new Error('Gemini returned invalid JSON.');
  }
  if (!Array.isArray(parsed) || parsed.length !== 5) {
    throw new Error('Gemini must return exactly five hex colors.');
  }
  const colors = parsed.map(normalizeHex);
  if (colors.some((color) => !color)) throw new Error('Gemini returned a non-hex color.');
  return colors;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 120) : '';
  const baseColor = normalizeHex(body.baseColor);
  const lighting = body.lighting === 'cool' ? 'cool' : body.lighting === 'warm' ? 'warm' : null;

  if (!prompt || !baseColor || !lighting) {
    return sendJson(res, 400, { error: 'Prompt, baseColor, and lighting are required.' });
  }
  if (!process.env.GEMINI_API_KEY) {
    return sendJson(res, 500, { error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const requestBody = {
    contents: [{
      parts: [{
        text: `You are an expert color theorist. The user wants a 5-color palette for the mood: '${prompt}'. The primary base color is ${baseColor} with ${lighting} lighting. Return ONLY a valid JSON array of 5 hex strings. No markdown, no text.`,
      }],
    }],
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    if (!response.ok) {
      return sendJson(res, response.status >= 500 ? 502 : response.status, {
        error: data?.error?.message || 'Gemini request failed.',
      });
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const colors = extractPalette(rawText);
    return sendJson(res, 200, { colors });
  } catch (error) {
    return sendJson(res, 502, { error: error instanceof Error ? error.message : 'Palette generation failed.' });
  }
};
