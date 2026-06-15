require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { getStore } = require('./lib/store');
const { getReceiptStore } = require('./lib/receipts');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const RECEIPTS_DIR = path.join(PUBLIC_DIR, 'receipts');
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

const STORE_KIND = (process.env.STORE || 'local').toLowerCase();
const store = getStore(STORE_KIND);
const receiptStore = getReceiptStore(process.env.RECEIPTS || 'local');

// ---- uploads (receipts) : en mémoire, puis envoyés au stockage choisi ----
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  return req.protocol + '://' + req.get('host');
}
function receiptUrl(req, recibo) {
  if (!recibo) return '';
  if (/^https?:\/\//i.test(recibo)) return recibo; // déjà une URL (Drive ou externe)
  return baseUrl(req) + '/receipts/' + recibo;
}

// ---- API ----
app.get('/api/config', (req, res) => {
  res.json({ store: STORE_KIND, categories: CATEGORIES, currencies: ['USD', 'BRL', '—'] });
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
    if (req.file && req.file.buffer) {
      recibo = await receiptStore.save(req.file.buffer, req.file.originalname);
    }
    const entry = {
      data: (b.data || '').trim(),
      descricao: (b.descricao || '').trim(),
      categoria: (b.categoria || 'A definir').trim(),
      valor: b.valor === '' || b.valor == null ? null : Number(String(b.valor).replace(',', '.')),
      moeda: (b.moeda || 'USD').trim(),
      pago_via: (b.pago_via || '').trim(),
      recibo,
      observacao: (b.observacao || '').trim(),
    };
    if (!entry.descricao) return res.status(400).json({ error: 'Descrição obrigatória' });
    const saved = await store.add(entry);
    saved.recibo_url = receiptUrl(req, saved.recibo);
    res.json(saved);
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.patch('/api/entries/:id', async (req, res) => {
  try {
    const updated = await store.update(req.params.id, req.body || {});
    if (updated) updated.recibo_url = receiptUrl(req, updated.recibo);
    res.json(updated || { ok: true });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.delete('/api/entries/:id', async (req, res) => {
  try { await store.remove(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

const CATEGORIES = [
  'Cobrar do cliente',
  'Despesa Latin Exclusive',
  'Despesa pessoal da chef',
  'A definir',
];

(async () => {
  if (store.init) await store.init();
  // seed once if store is empty
  try {
    const existing = await store.list();
    if (!existing || existing.length === 0) {
      const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'seed.json'), 'utf8'));
      for (const s of seed) await store.add(s);
      console.log(`[seed] ${seed.length} lançamentos iniciais inseridos.`);
    }
  } catch (e) { console.warn('[seed] ignorado:', e.message); }

  app.listen(PORT, () => {
    console.log(`Despesas chef USA — http://localhost:${PORT}  (store: ${STORE_KIND})`);
  });
})();
