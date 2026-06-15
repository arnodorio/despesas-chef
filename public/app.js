const CATS = ['Cobrar do cliente', 'Despesa Latin Exclusive', 'Despesa pessoal da chef', 'A definir'];
const CC = { 'Cobrar do cliente': 'c-cli', 'Despesa Latin Exclusive': 'c-le', 'Despesa pessoal da chef': 'c-chef', 'A definir': 'c-def' };
let rows = [], CONFIG = { ocr_enabled: false, default_brl_usd: 0.1983 };
let tipo = 'despesa';
const $ = (id) => document.getElementById(id);
const fmt = (v) => (v === null || v === undefined || v === '') ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sym = (m) => m === 'BRL' ? 'R$' : (m === 'USD' ? 'US$' : '');

async function loadConfig() {
  try {
    CONFIG = await (await fetch('/api/config')).json();
    $('storeName').textContent = ({ local: 'local (arquivo)', gsheet: 'Google Sheets', zoho: 'Zoho Creator' })[CONFIG.store] || CONFIG.store;
    $('rateInfo').textContent = String(CONFIG.default_brl_usd);
    if (CONFIG.ocr_enabled) { $('btnOcr').style.display = ''; $('ocrInfo').textContent = '· 📷 leitura de recibo ativada'; }
  } catch { $('storeName').textContent = '—'; }
}
async function load() {
  try { rows = await (await fetch('/api/entries')).json(); }
  catch (e) { rows = []; $('hint').textContent = 'Erro: ' + e; }
  render();
}
function totals() {
  const t = {}; CATS.forEach((c) => t[c] = 0);
  let fundos = 0, despesas = 0;
  rows.forEach((r) => {
    const u = (r.valor_usd === '' || r.valor_usd == null) ? null : Number(r.valor_usd);
    if (u === null) return;
    if (r.tipo === 'fundo') { fundos += u; return; }
    despesas += u;
    if (t[r.categoria] !== undefined) t[r.categoria] += u;
  });
  return { t, fundos, despesas, saldo: fundos - despesas };
}
function render() {
  const { t, fundos, saldo } = totals();
  const cards = CATS.map((c) => `<div class="card ${CC[c]}"><div class="card-t">${c}</div><div class="card-v">US$ ${fmt(t[c])}</div></div>`).join('');
  const saldoCard = `<div class="card c-saldo"><div class="card-t">Saldo (fundos − despesas)</div><div class="card-v">US$ ${fmt(saldo)}</div><div class="card-v2">Fundos: US$ ${fmt(fundos)}</div></div>`;
  $('cards').innerHTML = cards + saldoCard;

  $('tbody').innerHTML = rows.map((r) => {
    const isF = r.tipo === 'fundo';
    const rec = r.recibo ? `<a class="lk" href="#" data-img="${r.recibo_url || ''}">🧾 ver</a>` : '<span class="muted">—</span>';
    const cat = isF ? '<span class="fundo-tag">Aporte</span>'
      : `<select class="catsel ${CC[r.categoria] || ''}" data-id="${r.id}">${CATS.map((c) => `<option ${c === r.categoria ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
    const orig = (r.valor_orig == null || r.valor_orig === '') ? '—' : `${sym(r.moeda_orig)} ${fmt(r.valor_orig)}`;
    const usd = (r.valor_usd == null || r.valor_usd === '') ? '—' : `US$ ${fmt(r.valor_usd)}`;
    return `<tr class="${isF ? 'is-fundo' : ''}">
      <td class="ctr">${isF ? '➕' : ''}</td>
      <td class="ctr">${esc(r.data)}</td>
      <td>${esc(r.descricao)}</td>
      <td>${cat}</td>
      <td class="num">${orig}</td>
      <td class="num usd">${usd}</td>
      <td>${esc(r.pago_via)}</td>
      <td class="ctr">${rec}</td>
      <td class="obs">${esc(r.observacao)}</td>
      <td class="ctr"><button class="edit" data-edit="${r.id}" title="Editar">✎</button><button class="del" data-del="${r.id}" title="Excluir">✕</button></td>
    </tr>`;
  }).join('');
}
const esc = (s) => (s || '').toString().replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---- tipo toggle ----
function setTipo(t) {
  tipo = t;
  $('tabDespesa').classList.toggle('on', t === 'despesa');
  $('tabFundo').classList.toggle('on', t === 'fundo');
  $('f_cat').style.display = t === 'fundo' ? 'none' : '';
  $('f_desc').placeholder = t === 'fundo' ? 'Comentário (origem do dinheiro)' : 'Descrição';
}
$('tabDespesa').onclick = () => setTipo('despesa');
$('tabFundo').onclick = () => setTipo('fundo');

// ---- conversion preview ----
async function refreshPreview() {
  const v = parseFloat(($('f_valor').value || '').replace(',', '.'));
  const m = $('f_moeda').value;
  if (m === 'BRL' && !$('f_taxa').value) {
    try { const r = await (await fetch('/api/rate?moeda=BRL')).json(); $('f_taxa').value = r.taxa_usd; } catch {}
  }
  if (m === 'USD') $('f_taxa').value = '1';
  const taxa = parseFloat(($('f_taxa').value || '').replace(',', '.'));
  $('usdPrev').textContent = (!isNaN(v) && !isNaN(taxa)) ? '≈ US$ ' + fmt(v * taxa) : '';
}
$('f_valor').addEventListener('input', refreshPreview);
$('f_taxa').addEventListener('input', refreshPreview);
$('f_moeda').addEventListener('change', () => { $('f_taxa').value = ''; refreshPreview(); });

// ---- OCR ----
$('btnOcr').onclick = async () => {
  const f = $('f_file').files[0];
  if (!f) { $('hint').textContent = 'Escolha primeiro a foto do recibo.'; return; }
  $('hint').textContent = 'Lendo recibo…';
  try {
    const fd = new FormData(); fd.append('recibo', f);
    const d = await (await fetch('/api/ocr', { method: 'POST', body: fd })).json();
    if (d.error) throw new Error(d.error);
    if (d.valor != null && d.valor !== '') $('f_valor').value = String(d.valor).replace('.', ',');
    if (d.moeda) $('f_moeda').value = (String(d.moeda).toUpperCase() === 'BRL') ? 'BRL' : 'USD';
    if (d.data) $('f_data').value = d.data;
    if (d.descricao) $('f_desc').value = d.descricao;
    $('f_taxa').value = ''; await refreshPreview();
    $('hint').textContent = 'Recibo lido — confira os valores antes de adicionar. (Se a foto estiver cortada, complete à mão.)';
  } catch (e) { $('hint').textContent = 'Não consegui ler: ' + e.message; }
};

// ---- add ----
$('btnAdd').onclick = async () => {
  if (!$('f_desc').value.trim()) { $('hint').textContent = tipo === 'fundo' ? 'Preencha o comentário.' : 'Preencha a descrição.'; return; }
  const fd = new FormData();
  fd.append('tipo', tipo);
  fd.append('data', $('f_data').value);
  fd.append('descricao', $('f_desc').value);
  if (tipo !== 'fundo') fd.append('categoria', $('f_cat').value);
  fd.append('valor', $('f_valor').value);
  fd.append('moeda', $('f_moeda').value);
  if ($('f_taxa').value) fd.append('taxa_usd', $('f_taxa').value.replace(',', '.'));
  fd.append('pago_via', $('f_pago').value);
  fd.append('observacao', $('f_obs').value);
  if ($('f_file').files[0]) fd.append('recibo', $('f_file').files[0]);
  $('btnAdd').disabled = true; $('hint').textContent = 'Salvando…';
  try {
    const res = await fetch('/api/entries', { method: 'POST', body: fd });
    if (!res.ok) throw new Error((await res.json()).error || res.status);
    ['f_data', 'f_desc', 'f_valor', 'f_taxa', 'f_pago', 'f_obs'].forEach((i) => $(i).value = '');
    $('f_file').value = ''; $('usdPrev').textContent = '';
    $('hint').textContent = 'Salvo ✓'; await load();
  } catch (e) { $('hint').textContent = 'Erro: ' + e.message; }
  finally { $('btnAdd').disabled = false; }
};
$('btnReload').onclick = load;

// ---- clicks (lightbox, edit, delete, category) ----
document.addEventListener('click', async (e) => {
  const img = e.target.closest('[data-img]');
  if (img) { e.preventDefault(); const u = img.getAttribute('data-img'); if (u) { $('lb-img').src = u; $('lb-cap').textContent = 'Recibo'; $('lightbox').classList.add('on'); } return; }
  if (e.target.id === 'lb-close' || e.target.id === 'lightbox') $('lightbox').classList.remove('on');
  if (e.target.id === 'ed-close' || e.target.id === 'editModal') $('editModal').classList.remove('on');
  const del = e.target.closest('[data-del]');
  if (del) { if (confirm('Excluir este lançamento?')) { await fetch('/api/entries/' + del.getAttribute('data-del'), { method: 'DELETE' }); load(); } return; }
  const ed = e.target.closest('[data-edit]');
  if (ed) openEdit(ed.getAttribute('data-edit'));
});
document.addEventListener('change', async (e) => {
  const sel = e.target.closest('.catsel');
  if (sel) { await fetch('/api/entries/' + sel.getAttribute('data-id'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoria: sel.value }) }); load(); }
});

// ---- edit modal ----
function openEdit(id) {
  const r = rows.find((x) => String(x.id) === String(id)); if (!r) return;
  $('ed_id').value = r.id; $('ed_tipo').value = r.tipo || 'despesa';
  $('ed_data').value = r.data || ''; $('ed_desc').value = r.descricao || '';
  $('ed_cat').value = r.categoria || 'A definir';
  $('ed_valor').value = r.valor_orig != null ? String(r.valor_orig).replace('.', ',') : '';
  $('ed_moeda').value = r.moeda_orig || 'USD';
  $('ed_taxa').value = r.taxa_usd != null ? r.taxa_usd : '';
  $('ed_pago').value = r.pago_via || ''; $('ed_obs').value = r.observacao || '';
  $('ed_file').value = ''; $('ed_msg').textContent = '';
  document.querySelector('.ed-catwrap').style.display = $('ed_tipo').value === 'fundo' ? 'none' : '';
  $('editModal').classList.add('on');
}
$('ed_tipo').addEventListener('change', () => { document.querySelector('.ed-catwrap').style.display = $('ed_tipo').value === 'fundo' ? 'none' : ''; });
$('ed_save').onclick = async () => {
  const id = $('ed_id').value;
  const fd = new FormData();
  fd.append('tipo', $('ed_tipo').value);
  fd.append('data', $('ed_data').value);
  fd.append('descricao', $('ed_desc').value);
  fd.append('categoria', $('ed_cat').value);
  fd.append('valor_orig', $('ed_valor').value);
  fd.append('moeda_orig', $('ed_moeda').value);
  fd.append('taxa_usd', $('ed_taxa').value.replace(',', '.'));
  fd.append('pago_via', $('ed_pago').value);
  fd.append('observacao', $('ed_obs').value);
  if ($('ed_file').files[0]) fd.append('recibo', $('ed_file').files[0]);
  $('ed_save').disabled = true; $('ed_msg').textContent = 'Salvando…';
  try {
    const res = await fetch('/api/entries/' + id, { method: 'PATCH', body: fd });
    if (!res.ok) throw new Error((await res.json()).error || res.status);
    $('editModal').classList.remove('on'); await load();
  } catch (e) { $('ed_msg').textContent = 'Erro: ' + e.message; }
  finally { $('ed_save').disabled = false; }
};

setTipo('despesa');
loadConfig();
load();
