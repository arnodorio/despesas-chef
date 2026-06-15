// Lecture d'un reçu (OCR + extraction) via un modèle de vision.
// OCR_PROVIDER=anthropic | openai | none (défaut: none -> fonctionnalité désactivée)
// Clés : ANTHROPIC_API_KEY  ou  OPENAI_API_KEY
const https = require('https');

const PROVIDER = (process.env.OCR_PROVIDER || 'none').toLowerCase();

const PROMPT =
  'Você é um leitor de recibos. Extraia destes dados do recibo APENAS um JSON, sem texto extra, ' +
  'com as chaves: valor (número, o TOTAL pago), moeda ("USD" ou "BRL"), data ("DD/MM"), ' +
  'descricao (estabelecimento/itens, curto). Se algo não estiver visível, deixe a chave vazia ("" ou null). ' +
  'Atenção: a foto pode estar cortada e não mostrar o recibo inteiro — extraia só o que estiver visível.';

function postJSON(host, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      { host, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }, timeout: 30000 },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d.slice(0, 300))); } }); }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(data); req.end();
  });
}

function parseLoose(text) {
  if (!text) return {};
  const m = text.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : text); } catch { return {}; }
}

async function readReceipt(buffer, mime) {
  const b64 = buffer.toString('base64');
  const media = mime || 'image/jpeg';
  if (PROVIDER === 'anthropic') {
    const r = await postJSON('api.anthropic.com', '/v1/messages',
      { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      { model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: 300,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: media, data: b64 } },
          { type: 'text', text: PROMPT } ] }] });
    const text = (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    return parseLoose(text);
  }
  if (PROVIDER === 'openai') {
    const r = await postJSON('api.openai.com', '/v1/chat/completions',
      { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
      { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', max_tokens: 300,
        messages: [{ role: 'user', content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: `data:${media};base64,${b64}` } } ] }] });
    const text = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
    return parseLoose(text);
  }
  throw new Error('OCR désactivé (OCR_PROVIDER=none)');
}

module.exports = { readReceipt, enabled: PROVIDER !== 'none', provider: PROVIDER };
