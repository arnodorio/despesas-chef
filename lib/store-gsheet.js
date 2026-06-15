// Adaptateur Google Sheets : chaque lançamento est une ligne de l'onglet.
// Variables d'environnement requises :
//   STORE=gsheet
//   GOOGLE_SHEET_ID=<id de la feuille>
//   GOOGLE_SERVICE_ACCOUNT_JSON=<chemin vers le json du compte de service>  (ou GOOGLE_SERVICE_ACCOUNT_B64)
//   GOOGLE_SHEET_TAB=Lançamentos   (optionnel, défaut "Lançamentos")
//
// Partagez la feuille Google avec l'e-mail du compte de service (en Éditeur).
const { google } = require('googleapis');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = process.env.GOOGLE_SHEET_TAB || 'Lançamentos';
const HEADER = ['id', 'data', 'descricao', 'categoria', 'valor', 'moeda', 'pago_via', 'recibo', 'observacao'];

function credentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_B64) {
    return JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'));
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const fs = require('fs');
    return JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_JSON, 'utf8'));
  }
  throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON ou GOOGLE_SERVICE_ACCOUNT_B64 manquant');
}

let _sheets;
async function sheets() {
  if (_sheets) return _sheets;
  const auth = new google.auth.GoogleAuth({
    credentials: credentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  return _sheets;
}

function rowToObj(row) {
  const o = {};
  HEADER.forEach((h, i) => { o[h] = row[i] != null ? row[i] : ''; });
  o.valor = o.valor === '' ? null : Number(o.valor);
  return o;
}
function objToRow(o) {
  return HEADER.map((h) => (o[h] == null ? '' : o[h]));
}

module.exports = {
  async init() {
    if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID manquant');
    const s = await sheets();
    // garantir l'en-tête
    const res = await s.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A1:I1` }).catch(() => null);
    const has = res && res.data.values && res.data.values[0] && res.data.values[0].length;
    if (!has) {
      await s.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: `${TAB}!A1`, valueInputOption: 'RAW',
        requestBody: { values: [HEADER] },
      });
    }
  },
  async list() {
    const s = await sheets();
    const res = await s.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:I` });
    const rows = res.data.values || [];
    return rows.filter((r) => r.length).map(rowToObj);
  },
  async add(entry) {
    const s = await sheets();
    let id = entry.id;
    if (!id) {
      const cur = await this.list();
      id = cur.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
    }
    const row = { id, ...entry };
    await s.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `${TAB}!A:I`, valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS', requestBody: { values: [objToRow(row)] },
    });
    return row;
  },
  async _findRowIndex(s, id) {
    const res = await s.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:A` });
    const ids = (res.data.values || []).map((r) => r[0]);
    const idx = ids.findIndex((x) => String(x) === String(id));
    return idx === -1 ? -1 : idx + 2; // ligne réelle (1-based, +header)
  },
  async update(id, fields) {
    const s = await sheets();
    const line = await this._findRowIndex(s, id);
    if (line === -1) return null;
    const cur = await s.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A${line}:I${line}` });
    const obj = rowToObj((cur.data.values || [[]])[0]);
    const merged = { ...obj, ...fields, id: obj.id };
    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${TAB}!A${line}:I${line}`, valueInputOption: 'RAW',
      requestBody: { values: [objToRow(merged)] },
    });
    return merged;
  },
  async remove(id) {
    const s = await sheets();
    const line = await this._findRowIndex(s, id);
    if (line === -1) return;
    const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const sheet = meta.data.sheets.find((sh) => sh.properties.title === TAB);
    const sheetId = sheet ? sheet.properties.sheetId : 0;
    await s.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: line - 1, endIndex: line } } }] },
    });
  },
};
