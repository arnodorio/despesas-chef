// Sélecteur d'adaptateur de stockage.
// STORE=local (défaut, fichier JSON) | gsheet (Google Sheets) | zoho (Zoho Creator)
function getStore(kind) {
  switch ((kind || 'local').toLowerCase()) {
    case 'gsheet':
    case 'google':
    case 'sheets':
      return require('./store-gsheet');
    case 'zoho':
    case 'creator':
      return require('./store-zoho');
    case 'local':
    default:
      return require('./store-local');
  }
}
module.exports = { getStore };
