// Stockage local dans data/entries.json — fonctionne sans aucune configuration.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'entries.json');

function readAll() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return []; }
}
function writeAll(rows) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
}
function nextId(rows) {
  return rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
}

module.exports = {
  async init() { if (!fs.existsSync(FILE)) writeAll([]); },
  async list() { return readAll(); },
  async add(entry) {
    const rows = readAll();
    const row = { id: nextId(rows), ...entry };
    rows.push(row);
    writeAll(rows);
    return row;
  },
  async update(id, fields) {
    const rows = readAll();
    const i = rows.findIndex((r) => String(r.id) === String(id));
    if (i === -1) return null;
    rows[i] = { ...rows[i], ...fields, id: rows[i].id };
    writeAll(rows);
    return rows[i];
  },
  async remove(id) {
    const rows = readAll().filter((r) => String(r.id) !== String(id));
    writeAll(rows);
  },
};
