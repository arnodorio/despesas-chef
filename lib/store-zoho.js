// Adaptateur Zoho Creator (API v2.1).
// Variables d'environnement requises :
//   STORE=zoho
//   ZOHO_ACCOUNTS_URL=https://accounts.zoho.com        (ou .eu / .in selon votre datacenter)
//   ZOHO_API_DOMAIN=https://www.zohoapis.com           (ou .eu / .in)
//   ZOHO_CLIENT_ID=...
//   ZOHO_CLIENT_SECRET=...
//   ZOHO_REFRESH_TOKEN=...        (scope: ZohoCreator.report.ALL, ZohoCreator.form.ALL)
//   ZOHO_ACCOUNT_OWNER=...        (nom du propriétaire / org dans l'URL Creator)
//   ZOHO_APP_LINK_NAME=...        (link name de l'application Creator)
//   ZOHO_FORM_LINK_NAME=Despesas  (formulaire pour créer)
//   ZOHO_REPORT_LINK_NAME=Despesas_Report  (rapport pour lire/MAJ/supprimer)
//
// Champs attendus dans le formulaire Creator (link names) :
//   id, data, descricao, categoria, valor, moeda, pago_via, recibo, observacao
const axios = require('axios');

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
const API = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
const OWNER = process.env.ZOHO_ACCOUNT_OWNER;
const APP = process.env.ZOHO_APP_LINK_NAME;
const FORM = process.env.ZOHO_FORM_LINK_NAME || 'Despesas';
const REPORT = process.env.ZOHO_REPORT_LINK_NAME || 'Despesas_Report';
const BASE = () => `${API}/creator/v2.1/data/${OWNER}/${APP}`;

let _token = null, _exp = 0;
async function token() {
  if (_token && Date.now() < _exp - 60000) return _token;
  const url = `${ACCOUNTS}/oauth/v2/token`;
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const { data } = await axios.post(url, params.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  _token = data.access_token;
  _exp = Date.now() + (data.expires_in || 3600) * 1000;
  return _token;
}
async function headers() {
  return { Authorization: 'Zoho-oauthtoken ' + (await token()) };
}

function fromZoho(rec) {
  return {
    _zid: rec.ID,
    id: rec.id, data: rec.data, descricao: rec.descricao, categoria: rec.categoria,
    valor: rec.valor === '' || rec.valor == null ? null : Number(rec.valor),
    moeda: rec.moeda, pago_via: rec.pago_via, recibo: rec.recibo, observacao: rec.observacao,
  };
}
function toZoho(o) {
  return {
    id: o.id, data: o.data || '', descricao: o.descricao || '', categoria: o.categoria || '',
    valor: o.valor == null ? '' : String(o.valor), moeda: o.moeda || '',
    pago_via: o.pago_via || '', recibo: o.recibo || '', observacao: o.observacao || '',
  };
}

module.exports = {
  async init() {
    if (!OWNER || !APP) throw new Error('ZOHO_ACCOUNT_OWNER / ZOHO_APP_LINK_NAME manquant');
    await token();
  },
  async list() {
    const out = [];
    let start = 0; const limit = 200;
    // pagination simple
    for (let i = 0; i < 20; i++) {
      const { data } = await axios.get(`${BASE()}/report/${REPORT}`, {
        headers: await headers(), params: { from: start, limit },
      }).catch((e) => ({ data: { data: [] } }));
      const recs = (data && data.data) || [];
      out.push(...recs.map(fromZoho));
      if (recs.length < limit) break;
      start += limit;
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
  async _findZid(id) {
    const all = await this.list();
    const hit = all.find((r) => String(r.id) === String(id));
    return hit ? hit._zid : null;
  },
  async update(id, fields) {
    const all = await this.list();
    const cur = all.find((r) => String(r.id) === String(id));
    if (!cur) return null;
    const merged = { ...cur, ...fields, id: cur.id };
    await axios.patch(`${BASE()}/report/${REPORT}/${cur._zid}`, { data: toZoho(merged) }, { headers: await headers() });
    return merged;
  },
  async remove(id) {
    const zid = await this._findZid(id);
    if (!zid) return;
    await axios.delete(`${BASE()}/report/${REPORT}/${zid}`, { headers: await headers() });
  },
};
