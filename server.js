require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { getStore } = require('./lib/store');
const { getReceiptStore } = require('./lib/receipts');
const { getRateToUSD } = require('./lib/fx');
const ocr = require('./lib/ocr');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const RECEIPTS_DIR = path.join(PUBLIC_DIR, 'receipts');
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

const STORE_KIND = (process.env.STORE || 'local').toLowerCase();
const store = getStore(STORE_KIND);
const receiptStore = getReceiptStore(process.env.RECEIPTS || 'local');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const CATEGORIES = ['Cobrar do cliente', 'Despesa Latin Exclusive', 'Despesa pessoal da chef', 'A definir'];

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  return req.protocol + '://' + req.get('host');
}
function receiptUrl(req, recibo) {
  if (!recibo) return '';
  if (/^https?:\/\//i.test(recibo)) return recibo;
  return baseUrl(req) + '/receipts/' + recibo;
}
function num(v) {
  if (v === '' || v == null) return null;
  return Number(String(v).replace(',', '.'));
}
// calcule taxa_usd + valor_usd à partir de valor_orig + moeda (+ taxa optionnelle)
async function withConversion(e) {
  const v = e.valor_orig;
  if (v == null || isNaN(v)) { e.taxa_usd = e.taxa_usd || 1; e.valor_usd = null; return e; }
  let taxa = e.taxa_usd != null && !isNaN(e.taxa_usd) ? Number(e.taxa_usd) : await getRateToUSD(e.moeda_orig);
  e.taxa_usd = taxa;
  e.valor_usd = Math.round(v * taxa * 100) / 100;
  return e;
}

app.get('/api/config', (req, res) => {
  res.json({
    store: STORE_KIND,
    categories: CATEGORIES,
    currencies: ['USD', 'BRL', '—'],
    ocr_enabled: ocr.enabled,
    default_brl_usd: require('./lib/fx').DEFAULT_BRL_USD,
  });
});

app.get('/api/rate', async (req, res) => {
  try { res.json({ moeda: req.query.moeda || 'BRL', taxa_usd: await getRateToUSD(req.query.moeda || 'BRL') }); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.get('/api/entries', async (req, res) => {
  try {
    const rows = await store.list();
    rows.forEach((r) => { r.recibo_url = receiptUrl(req, r.recibo); });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/entries', upload.single('recibo'), async (req, res) => {
  try {
    const b = req.body || {};
    let recibo = (b.recibo || '').trim();
    if (req.file && req.file.buffer) recibo = await receiptStore.save(req.file.buffer, req.file.originalname);
    const tipo = (b.tipo || 'despesa').trim();
    let entry = {
      tipo,
      data: (b.data || '').trim(),
      descricao: (b.descricao || '').trim(),
      categoria: tipo === 'fundo' ? 'Aporte de fundos' : (b.categoria || 'A definir').trim(),
      valor_orig: num(b.valor_orig != null ? b.valor_orig : b.valor),
      moeda_orig: (b.moeda_orig || b.moeda || 'USD').trim(),
      taxa_usd: num(b.taxa_usd),
      pago_via: (b.pago_via || '').trim(),
      recibo,
      observacao: (b.observacao || '').trim(),
    };
    if (!entry.descricao) return res.status(400).json({ error: 'Descrição obrigatória' });
    entry = await withConversion(entry);
    const saved = await store.add(entry);
    saved.recibo_url = receiptUrl(req, saved.recibo);
    res.json(saved);
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.patch('/api/entries/:id', upload.single('recibo'), async (req, res) => {
  try {
    const b = req.body || {};
    const fields = {};
    ['tipo', 'data', 'descricao', 'categoria', 'moeda_orig', 'pago_via', 'observacao'].forEach((k) => {
      if (b[k] !== undefined) fields[k] = String(b[k]).trim();
    });
    if (b.moeda !== undefined && b.moeda_orig === undefined) fields.moeda_orig = String(b.moeda).trim();
    if (b.valor_orig !== undefined || b.valor !== undefined) fields.valor_orig = num(b.valor_orig != null ? b.valor_orig : b.valor);
    if (b.taxa_usd !== undefined) fields.taxa_usd = num(b.taxa_usd);
    if (req.file && req.file.buffer) fields.recibo = await receiptStore.save(req.file.buffer, req.file.originalname);
    else if (b.recibo !== undefined) fields.recibo = String(b.recibo).trim();

    // recompute conversion if money-related fields changed
    if ('valor_orig' in fields || 'moeda_orig' in fields || 'taxa_usd' in fields) {
      const current = (await store.list()).find((r) => String(r.id) === String(req.params.id)) || {};
      const merged = { ...current, ...fields };
      if (b.taxa_usd === undefined && ('valor_orig' in fields || 'moeda_orig' in fields)) merged.taxa_usd = undefined; // re-fetch
      const c = await withConversion({ valor_orig: merged.valor_orig, moeda_orig: merged.moeda_orig, taxa_usd: merged.taxa_usd });
      fields.taxa_usd = c.taxa_usd; fields.valor_usd = c.valor_usd;
    }
    const updated = await store.update(req.params.id, fields);
    if (updated) updated.recibo_url = receiptUrl(req, updated.recibo);
    res.json(updated || { ok: true });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.delete('/api/entries/:id', async (req, res) => {
  try { await store.remove(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

// OCR : lit un reçu et renvoie {valor, moeda, data, descricao} (sans enregistrer)
app.post('/api/ocr', upload.single('recibo'), async (req, res) => {
  try {
    if (!ocr.enabled) return res.status(501).json({ error: 'OCR não configurado' });
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem' });
    const data = await ocr.readReceipt(req.file.buffer, req.file.mimetype);
    res.json(data);
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

(async () => {
  if (store.init) await store.init();
  try {
    const existing = await store.list();
    if (!existing || existing.length === 0) {
      const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'seed.json'), 'utf8'));
      for (const s of seed) await store.add(s);
      console.log(`[seed] ${seed.length} registros iniciais inseridos.`);
    }
  } catch (e) { console.warn('[seed] ignorado:', e.message); }
  app.listen(PORT, () => console.log(`Despesas chef USA — http://localhost:${PORT}  (store: ${STORE_KIND}, ocr: ${ocr.provider})`));
})();
