// Stockage des reçus.
// RECEIPTS=local  -> fichiers sur disque (public/receipts) ; à utiliser sur un serveur/VPS à disque persistant.
// RECEIPTS=drive  -> upload vers un dossier Google Drive (lien durable, idéal pour Render/Railway éphémères).
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const RECEIPTS_DIR = path.join(__dirname, '..', 'public', 'receipts');

function localStore() {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  return {
    // retourne la valeur à mettre dans la colonne "recibo" (ici: un nom de fichier servi par l'app)
    async save(buffer, originalName) {
      const ext = (path.extname(originalName || '') || '.jpg').toLowerCase();
      const name = 'recibo-' + Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
      fs.writeFileSync(path.join(RECEIPTS_DIR, name), buffer);
      return name; // l'app résout /receipts/<name>
    },
  };
}

function driveStore() {
  const { google } = require('googleapis');
  const FOLDER = process.env.GOOGLE_RECEIPTS_FOLDER_ID;
  function credentials() {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_B64)
      return JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'));
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
      return JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_JSON, 'utf8'));
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON / _B64 manquant pour RECEIPTS=drive');
  }
  let _drive;
  async function drive() {
    if (_drive) return _drive;
    const auth = new google.auth.GoogleAuth({
      credentials: credentials(),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    _drive = google.drive({ version: 'v3', auth: await auth.getClient() });
    return _drive;
  }
  return {
    async save(buffer, originalName) {
      if (!FOLDER) throw new Error('GOOGLE_RECEIPTS_FOLDER_ID manquant pour RECEIPTS=drive');
      const d = await drive();
      const ext = (path.extname(originalName || '') || '.jpg').toLowerCase();
      const name = 'recibo-' + Date.now() + ext;
      const res = await d.files.create({
        requestBody: { name, parents: [FOLDER] },
        media: { mimeType: 'image/jpeg', body: Readable.from(buffer) },
        fields: 'id, webViewLink',
        supportsAllDrives: true,
      });
      // lien lisible par toute personne disposant du lien (la chef / Arnaud)
      try {
        await d.permissions.create({
          fileId: res.data.id,
          requestBody: { role: 'reader', type: 'anyone' },
          supportsAllDrives: true,
        });
      } catch (e) { /* dossier déjà partagé : on ignore */ }
      return res.data.webViewLink; // URL complète stockée dans "recibo"
    },
  };
}

function getReceiptStore(kind) {
  return (kind || 'local').toLowerCase() === 'drive' ? driveStore() : localStore();
}

module.exports = { getReceiptStore };
