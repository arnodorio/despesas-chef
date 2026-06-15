const CATS = ['Cobrar do cliente', 'Despesa Latin Exclusive', 'Despesa pessoal da chef', 'A definir'];
const CC = { 'Cobrar do cliente': 'c-cli', 'Despesa Latin Exclusive': 'c-le', 'Despesa pessoal da chef': 'c-chef', 'A definir': 'c-def' };
let rows = [];

const $ = (id) => document.getElementById(id);
function fmt(v) { if (v === null || v === undefined || v === '') return '—'; return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

async function loadConfig() {
  try { const c = await (await fetch('/api/config')).json(); $('storeName').textContent = ({ local: 'local (arquivo)', gsheet: 'Google Sheets', zoho: 'Zoho Creator' })[c.store] || c.store; }
  catch { $('storeName').textContent = '—'; }
}
async function load() {
  try { rows = await (await fetch('/api/entries')).json(); }
  catch (e) { rows = []; $('hint').textContent = 'Erro ao carregar: ' + e; }
  render();
}
function totals() {
  const t = {}; CATS.forEach((c) => t[c] = { USD: 0, BRL: 0 });
  rows.forEach((r) => {
    if (r.valor === null || r.valor === undefined || r.valor === '') return;
    if (!t[r.categoria]) return;
    if (r.moeda === 'USD') t[r.categoria].USD += Number(r.valor);
    else if (r.moeda === 'BRL') t[r.categoria].BRL += Number(r.valor);
  });
  return t;
}
function render() {
  const t = totals();
  $('cards').innerHTML = CATS.map((c) => `
    <div class="card ${CC[c]}"><div class="card-t">${c}</div>
      <div class="card-v">US$ ${fmt(t[c].USD)}</div>
      <div class="card-v2">R$ ${fmt(t[c].BRL)}</div></div>`).join('');

  $('tbody').innerHTML = rows.map((r) => {
    const rec = r.recibo
      ? `<a class="lk" href="#" data-img="${r.recibo_url || ''}">🧾 ver</a>`
      : '<span class="muted">—</span>';
    const sel = `<select class="catsel ${CC[r.categoria] || ''}" data-id="${r.id}">` +
      CATS.map((c) => `<option ${c === r.categoria ? 'selected' : ''}>${c}</option>`).join('') + '</select>';
    return `<tr>
      <td class="ctr">${r.data || ''}</td>
      <td>${esc(r.descricao)}</td>
      <td>${sel}</td>
      <td class="num">${fmt(r.valor)}</td>
      <td class="ctr">${r.moeda || ''}</td>
      <td>${esc(r.pago_via)}</td>
      <td class="ctr">${rec}</td>
      <td class="obs">${esc(r.observacao)}</td>
      <td class="ctr"><button class="del" data-del="${r.id}" title="Excluir">✕</button></td>
    </tr>`;
  }).join('');
}
function esc(s) { return (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

document.addEventListener('click', async (e) => {
  const img = e.target.closest('[data-img]');
  if (img) { e.preventDefault(); const u = img.getAttribute('data-img'); if (u) { $('lb-img').src = u; $('lb-cap').textContent = 'Recibo'; $('lightbox').classList.add('on'); } return; }
  if (e.target.id === 'lb-close' || e.target.id === 'lightbox') $('lightbox').classList.remove('on');
  const del = e.target.closest('[data-del]');
  if (del) {
    if (!confirm('Excluir este lançamento?')) return;
    await fetch('/api/entries/' + del.getAttribute('data-del'), { method: 'DELETE' });
    load();
  }
});
document.addEventListener('change', async (e) => {
  const sel = e.target.closest('.catsel');
  if (sel) {
    await fetch('/api/entries/' + sel.getAttribute('data-id'), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria: sel.value }),
    });
    load();
  }
});
$('btnReload').onclick = load;
$('btnAdd').onclick = async () => {
  const fd = new FormData();
  fd.append('data', $('f_data').value);
  fd.append('descricao', $('f_desc').value);
  fd.append('categoria', $('f_cat').value);
  fd.append('valor', $('f_valor').value);
  fd.append('moeda', $('f_moeda').value);
  fd.append('pago_via', $('f_pago').value);
  fd.append('observacao', $('f_obs').value);
  if ($('f_file').files[0]) fd.append('recibo', $('f_file').files[0]);
  if (!$('f_desc').value.trim()) { $('hint').textContent = 'Preencha a descrição.'; return; }
  $('btnAdd').disabled = true; $('hint').textContent = 'Salvando…';
  try {
    const res = await fetch('/api/entries', { method: 'POST', body: fd });
    if (!res.ok) throw new Error((await res.json()).error || res.status);
    ['f_data', 'f_desc', 'f_valor', 'f_pago', 'f_obs'].forEach((i) => $(i).value = '');
    $('f_file').value = '';
    $('hint').textContent = 'Lançamento salvo ✓';
    await load();
  } catch (e) { $('hint').textContent = 'Erro: ' + e.message; }
  finally { $('btnAdd').disabled = false; }
};

loadConfig();
load();
