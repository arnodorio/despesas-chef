// Taux de change vers USD. USD=1. BRL : tente une API gratuite (Frankfurter),
// sinon retombe sur DEFAULT_BRL_USD (taux BCB par défaut).
const https = require('https');

const DEFAULT_BRL_USD = Number(process.env.DEFAULT_BRL_USD || 0.1983); // 1 BRL en USD (BCB 15/06/2026)
const cache = {}; // { 'BRL': { rate, day } }

function todayStr() { return new Date().toISOString().slice(0, 10); }

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 4000 }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

// retourne le facteur f tel que valeur_usd = valeur_orig * f
async function getRateToUSD(currency) {
  const cur = (currency || 'USD').toUpperCase();
  if (cur === 'USD' || cur === '—' || cur === '') return 1;
  if (cur !== 'BRL') return 1; // autres devises : à étendre si besoin
  if (cache.BRL && cache.BRL.day === todayStr()) return cache.BRL.rate;
  let rate = DEFAULT_BRL_USD;
  try {
    const j = await fetchJSON('https://api.frankfurter.dev/v1/latest?base=BRL&symbols=USD');
    if (j && j.rates && j.rates.USD) rate = Number(j.rates.USD);
  } catch (e) { /* fallback DEFAULT_BRL_USD */ }
  cache.BRL = { rate, day: todayStr() };
  return rate;
}

module.exports = { getRateToUSD, DEFAULT_BRL_USD };
