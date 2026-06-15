// Adaptateur Zoho Creator (API v2.1). Voir README section 2 (Option B).
// Champs du formulaire (link names) attendus :
//   id, tipo, data, descricao, categoria, valor_orig, moeda_orig, taxa_usd, valor_usd, pago_via, recibo, observacao
const axios = require('axios');

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
const API = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
const OWNER = process.env.ZOHO_ACCOUNT_OWNER;
const APP = process.env.ZOHO_APP_LINK_NAME;
const FORM = process.env.ZOHO_FORM_LINK_NAME || 'Despesas';
const REPORT = process.env.ZOHO_REPORT_LINK_NAME || 'Despesas_Report';
const BASE = () => `${API}/creator/v2.1/data/${OWNER}/${APP}`;
const FIELDS = ['id', 'tipo', 'data', 'descricao', 'categoria', 'valor_orig', 'moeda_orig', 'taxa_usd', 'valor_usd', 'pago_via', 'recibo', 'observacao'];
const NUMS = new Set(['valor_orig', 'taxa_usd', 'valor_usd']);

let _token = null, _exp = 0;
async function token() {
  if (_token && Date.now() < _exp - 60000) return _token;
  const params = new URLSearchParams({ refresh_token: process.env.ZOHO_REFRESH_TOKEN, client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET, grant_type: 'refresh_token' });
  const { data } = await axios.post(`${ACCOUNTS}/oauth/v2/token`, params.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  _token = data.access_token; _exp = Date.now() + (data.expires_in || 3600) * 1000; return _token;
}
async function headers() { return { Authorization: 'Zoho-oauthtoken ' + (await token()) }; }
function fromZoho(rec) {
  const o = { _zid: rec.ID };
  FIELDS.forEach((f) => { let v = rec[f]; if (NUMS.has(f)) v = v === '' || v == null ? null : Number(v); o[f] = v != null ? v : (NUMS.has(f) ? null : ''); });
  return o;
}
function toZoho(o) { const r = {}; FIELDS.forEach((f) => { r[f] = o[f] == null ? '' : String(o[f]); }); return r; }

module.exports = {
  async init() { if (!OWNER || !APP) throw new Error('ZOHO_ACCOUNT_OWNER / ZOHO_APP_LINK_NAME manquant'); await token(); },
  async list() {
    const out = []; let start = 0; const limit = 200;
    for (let i = 0; i < 20; i++) {
      const { data } = await axios.get(`${BASE()}/report/${REPORT}`, { headers: await headers(), params: { from: start, limit } }).catch(() => ({ data: { data: [] } }));
      const recs = (data && data.data) || []; out.push(...recs.map(fromZoho));
      if (recs.length < limit) break; start += limit;
    }
    return out;
  },
  async add(entry) {
    let id = entry.id;
    if (!id) { const cur = await this.list(); id = cur.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1; }
    const row = { id, ...entry };
    await axios.post(`${BASE()}/form/${FORM}`, { data: toZoho(row) }, { headers: await headers() });
    return row;
  },
  async update(id, fields) {
    const cur = (await this.list()).find((r) => String(r.id) === String(id));
    if (!cur) return null;
    const merged = { ...cur, ...fields, id: cur.id };
    await axios.patch(`${BASE()}/report/${REPORT}/${cur._zid}`, { data: toZoho(merged) }, { headers: await headers() });
    return merged;
  },
  async remove(id) {
    const cur = (await this.list()).find((r) => String(r.id) === String(id));
    if (!cur) return;
    await axios.delete(`${BASE()}/report/${REPORT}/${cur._zid}`, { headers: await headers() });
  },
};
