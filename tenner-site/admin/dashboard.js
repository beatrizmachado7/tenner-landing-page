/* TENNER. — Dashboard de gestão (seguidores, visitas, clientes/pedidos, estado dos projetos e jogos)
 *
 * Onde ficam os dados:
 *   Tudo o que se edita aqui é guardado em ficheiros JSON na pasta "painel-dados/" do repositório
 *   (fora da pasta tenner-site, por isso NÃO é publicado no site). A leitura e a escrita passam pelo
 *   Git Gateway do Netlify, com o mesmo login do painel. Cada gravação é um commit com [skip ci]
 *   para não gerar uma nova publicação do site.
 *
 * Visitas: o dashboard procura /.netlify/functions/visitas (formato: {"dias":[{"data":"AAAA-MM-DD","visitas":N}]}).
 *   Enquanto não existir uma fonte de medição, mostra "Dados ainda não disponíveis".
 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var TZ = 'Europe/Lisbon';
  var BRANCH = 'main';
  var DIR = 'painel-dados/';

  /* ---------------- datas (sempre no fuso de Portugal) ---------------- */
  function todayISO() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function nowLisbonISO() {
    var d = new Date();
    var p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day + 'T' + (p.hour === '24' ? '00' : p.hour) + ':' + p.minute;
  }
  function dayNum(iso) { var a = String(iso || '').split('-'); return Date.UTC(+a[0], +a[1] - 1, +a[2]) / 864e5; }
  function diffDays(iso) { return dayNum(iso) - dayNum(todayISO()); }
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function parts(iso) { var a = String(iso || '').split('-'); return { y: +a[0], m: +a[1], d: +a[2] }; }
  function weekday(iso) { var p = parts(iso); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }
  function fmtDate(iso) { if (!iso) return '—'; var p = parts(iso); return String(p.d).padStart(2, '0') + '/' + String(p.m).padStart(2, '0') + '/' + p.y; }
  function fmtLong(iso) { var p = parts(iso); return DIAS[weekday(iso)] + ', ' + p.d + ' de ' + MESES[p.m - 1]; }
  function relDays(n) {
    if (n === 0) return 'Hoje';
    if (n === 1) return 'Amanhã';
    if (n === -1) return 'Ontem';
    return n > 0 ? 'Em ' + n + ' dias' : 'Há ' + (-n) + ' dias';
  }
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var num = function (n) { return new Intl.NumberFormat('pt-PT').format(n); };

  /* ---------------- guardar / ler (Git Gateway do Netlify) ---------------- */
  function b64enc(str) { var bytes = new TextEncoder().encode(str), bin = ''; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]); return btoa(bin); }
  function b64dec(b64) { var bin = atob(String(b64).replace(/\s/g, '')); var bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); }
  function token() {
    var id = window.netlifyIdentity, u = id && id.currentUser && id.currentUser();
    if (!u) return Promise.reject(new Error('Sessão terminada. Volta a entrar no painel.'));
    return u.jwt ? u.jwt() : Promise.resolve(u.token && u.token.access_token);
  }
  var shas = {};
  function api(path, opts) {
    return token().then(function (t) {
      opts = opts || {};
      opts.headers = Object.assign({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, opts.headers || {});
      return fetch('/.netlify/git/github/contents/' + path, opts);
    });
  }
  function load(name, def) {
    return api(DIR + name + '.json?ref=' + BRANCH, { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) { shas[name] = null; return JSON.parse(JSON.stringify(def)); }
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Sem permissão para ler os dados. Sai e volta a entrar no painel.' : 'O servidor respondeu com erro ' + r.status + '. Tenta de novo daqui a pouco.');
      return r.json().then(function (j) {
        shas[name] = j.sha;
        try { return Object.assign(JSON.parse(JSON.stringify(def)), JSON.parse(b64dec(j.content || ''))); }
        catch (e) { throw new Error('O ficheiro ' + name + '.json tem um erro de formato.'); }
      });
    });
  }
  function save(name, data, msg) {
    var body = { message: 'Painel: ' + msg + ' [skip ci]', content: b64enc(JSON.stringify(data, null, 2) + '\n'), branch: BRANCH };
    if (shas[name]) body.sha = shas[name];
    return api(DIR + name + '.json', { method: 'PUT', body: JSON.stringify(body) }).then(function (r) {
      if (r.status === 409 || r.status === 422) throw new Error('Estes dados foram alterados noutro sítio. Atualiza a página e tenta de novo.');
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Sem permissão para guardar. Sai e volta a entrar no painel.' : 'Não foi possível guardar (erro ' + r.status + '). Tenta de novo.');
      return r.json().then(function (j) { shas[name] = j.content && j.content.sha; });
    });
  }

  /* ---------------- estado ---------------- */
  var DEFAULTS = {
    instagram: { conta: 'tenner10_', seguidores: null, atualizado_em: null, fonte: 'manual', historico: [] },
    projetos: { items: [] },
    jogos: { items: [] }
  };
  var D = {}, status = {}; // status[name] = 'loading' | 'ok' | 'error:<msg>'
  Object.keys(DEFAULTS).forEach(function (k) { status[k] = 'loading'; });
  var loaded = false, loading = false;

  var FASES = [
    { v: 'briefing', l: 'Briefing' }, { v: 'producao', l: 'Em produção' }, { v: 'revisao', l: 'Em revisão' },
    { v: 'aprovacao', l: 'A aguardar aprovação' }, { v: 'concluido', l: 'Concluído' }
  ];
  var label = function (list, v) { var f = list.filter(function (x) { return x.v === v; })[0]; return f ? f.l : v; };
  var opts = function (list, cur) { return list.map(function (x) { return '<option value="' + esc(x.v) + '"' + (x.v === cur ? ' selected' : '') + '>' + esc(x.l) + '</option>'; }).join(''); };

  function loadAll(force) {
    if (loading || (loaded && !force)) return;
    loading = true;
    Object.keys(DEFAULTS).forEach(function (k) { status[k] = 'loading'; });
    renderAll();
    Promise.all(Object.keys(DEFAULTS).map(function (k) {
      return load(k, DEFAULTS[k]).then(function (d) { D[k] = d; status[k] = 'ok'; }, function (e) { D[k] = JSON.parse(JSON.stringify(DEFAULTS[k])); status[k] = 'error:' + e.message; });
    })).then(function () { loading = false; loaded = true; renderAll(); });
    loadVisits();
  }

  function persist(name, msg) {
    var box = document.body;
    box.classList.add('db-saving');
    return save(name, D[name], msg).then(function () {
      box.classList.remove('db-saving');
      toast('Guardado');
    }, function (e) {
      box.classList.remove('db-saving');
      toast(e.message, true);
      throw e;
    });
  }

  /* ---------------- UI comum ---------------- */
  var toastT;
  function toast(msg, err) {
    var t = $('#db-toast');
    t.textContent = msg; t.className = 'db-toast show' + (err ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'db-toast'; }, err ? 6000 : 2200);
  }
  function stateBox(name, emptyHtml) {
    var s = status[name];
    if (s === 'loading') return '<div class="db-state"><span class="db-spin"></span>A carregar…</div>';
    if (s && s.indexOf('error:') === 0) return '<div class="db-state err"><b>Não foi possível carregar.</b><span>' + esc(s.slice(6)) + '</span><button type="button" class="db-btn ghost sm" data-retry>Tentar novamente</button></div>';
    return emptyHtml ? '<div class="db-state empty">' + emptyHtml + '</div>' : '';
  }
  var ICON_LINK = '<svg viewBox="0 0 24 24"><path d="M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>';
  var ICON_EDIT = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

  /* ---------------- modal / formulários ---------------- */
  var FORMS = {
    instagram: { title: 'Seguidores do Instagram', fields: [
      { k: 'conta', l: 'Conta (sem @)', t: 'text', req: true },
      { k: 'seguidores', l: 'Número de seguidores', t: 'number', req: true, hint: 'Vê o número no perfil do Instagram e escreve-o aqui.' }
    ] },
    projetos: { title: 'Pedido do cliente', fields: [
      { k: 'cliente', l: 'Nome do cliente', t: 'text', req: true },
      { k: 'nome', l: 'Nome do projeto', t: 'text', req: true },
      { k: 'prazo', l: 'Data de entrega', t: 'date', req: true, def: todayISO },
      { k: 'fase', l: 'Estado do projeto', t: 'select', o: FASES, req: true, def: function () { return 'briefing'; } }
    ] },
    jogos: { title: 'Jogo', fields: [
      { k: 'casa', l: 'Equipa da casa', t: 'text', req: true },
      { k: 'fora', l: 'Equipa visitante', t: 'text', req: true },
      { k: 'competicao', l: 'Competição', t: 'text', req: true, hint: 'Ex.: Liga Portugal, Liga 3, Taça de Portugal' },
      { k: 'data', l: 'Data', t: 'date', req: true, def: todayISO },
      { k: 'hora', l: 'Hora (Portugal)', t: 'time', req: true },
      { k: 'projeto_id', l: 'Projeto associado (opcional)', t: 'project' }
    ] }
  };
  var editing = null; // { name, id }
  function openForm(name, id) {
    if (String(status[name]).indexOf('error:') === 0) { toast('Não é possível editar enquanto os dados não carregarem.', true); return; }
    var cfg = FORMS[name];
    var item = name === 'instagram' ? D.instagram : (id ? D[name].items.filter(function (x) { return x.id === id; })[0] : null);
    editing = { name: name, id: id || null };
    $('#db-modal-t').textContent = (item && name !== 'instagram' ? 'Editar · ' : name === 'instagram' ? 'Atualizar · ' : 'Novo · ') + cfg.title;
    $('#db-form-fields').innerHTML = cfg.fields.map(function (f) {
      var v = item && item[f.k] != null ? item[f.k] : (f.def ? f.def() : '');
      var inp;
      if (f.t === 'select') inp = '<select name="' + f.k + '">' + (f.req ? '' : '<option value="">—</option>') + opts(f.o, v) + '</select>';
      else if (f.t === 'project') inp = '<select name="' + f.k + '"><option value="">Nenhum</option>' + (D.projetos ? D.projetos.items : []).map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === v ? ' selected' : '') + '>' + esc(p.nome + ' · ' + p.cliente) + '</option>'; }).join('') + '</select>';
      else if (f.t === 'textarea') inp = '<textarea name="' + f.k + '" rows="3">' + esc(v) + '</textarea>';
      else inp = '<input name="' + f.k + '" type="' + f.t + '"' + (f.t === 'number' ? ' min="0" step="1" inputmode="numeric"' : '') + ' value="' + esc(v) + '"' + (f.req ? ' required' : '') + '>';
      return '<label class="db-field"><span>' + esc(f.l) + (f.req ? ' <i>*</i>' : '') + '</span>' + inp + (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '</label>';
    }).join('');
    $('#db-del').hidden = !item || name === 'instagram';
    var m = $('#db-modal'); m.hidden = false;
    requestAnimationFrame(function () { m.classList.add('open'); var first = $('input,select,textarea', m); if (first) first.focus(); });
  }
  function closeForm() { var m = $('#db-modal'); m.classList.remove('open'); setTimeout(function () { m.hidden = true; }, 180); editing = null; }
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', closeForm); });
  $('#db-modal').addEventListener('click', function (e) { if (e.target.id === 'db-modal') closeForm(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && editing) closeForm(); });

  $('#db-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!editing) return;
    var name = editing.name, cfg = FORMS[name], vals = {}, bad = null;
    cfg.fields.forEach(function (f) {
      var el = $('[name="' + f.k + '"]', this);
      var v = el ? el.value.trim() : '';
      if (f.t === 'number' && v !== '') v = Math.max(0, parseInt(v.replace(/\D/g, ''), 10) || 0);
      if (f.req && (v === '' || v == null)) bad = bad || el;
      vals[f.k] = v;
    }, this);
    $$('.db-field', this).forEach(function (l) { l.classList.remove('bad'); });
    if (bad) { bad.closest('.db-field').classList.add('bad'); bad.focus(); toast('Preenche os campos obrigatórios.', true); return; }
    var before = JSON.stringify(D[name]), msg;
    if (name === 'instagram') {
      var ig = D.instagram;
      ig.conta = String(vals.conta).replace(/^@/, '');
      ig.seguidores = vals.seguidores; ig.atualizado_em = nowLisbonISO(); ig.fonte = 'manual';
      ig.historico = (ig.historico || []).concat([{ data: ig.atualizado_em, seguidores: ig.seguidores }]).slice(-60);
      msg = 'atualiza seguidores do Instagram';
    } else if (editing.id) {
      var it = D[name].items.filter(function (x) { return x.id === editing.id; })[0];
      Object.assign(it, vals); msg = 'edita ' + name;
    } else {
      vals.id = uid(); vals.criado_em = nowLisbonISO(); D[name].items.push(vals); msg = name === 'projetos' ? 'novo pedido de ' + vals.cliente : 'adiciona ' + name;
    }
    var btn = $('#db-save'); btn.disabled = true;
    persist(name, msg).then(function () { btn.disabled = false; closeForm(); renderAll(); }, function () { btn.disabled = false; D[name] = JSON.parse(before); renderAll(); });
  });
  $('#db-del').addEventListener('click', function () {
    if (!editing || !editing.id) return;
    if (!window.confirm('Apagar este registo? Não dá para desfazer.')) return;
    var name = editing.name, before = JSON.stringify(D[name]);
    D[name].items = D[name].items.filter(function (x) { return x.id !== editing.id; });
    if (name === 'projetos') (D.jogos.items || []).forEach(function (j) { if (j.projeto_id === editing.id) j.projeto_id = ''; });
    persist(name, 'apaga ' + name).then(function () { closeForm(); renderAll(); }, function () { D[name] = JSON.parse(before); renderAll(); });
  });

  // alterar estado diretamente nas listas
  function quickSet(name, id, key, value, msg) {
    var it = D[name].items.filter(function (x) { return x.id === id; })[0];
    if (!it || it[key] === value) return;
    var old = it[key]; it[key] = value;
    renderAll();
    persist(name, msg).catch(function () { it[key] = old; renderAll(); });
  }

  /* ---------------- 1. Instagram ---------------- */
  function renderIG() {
    var box = $('#kpi-ig .db-kpi-body'), s = status.instagram;
    if (s === 'loading' || !D.instagram) { box.innerHTML = '<div class="db-skel"></div>'; return; }
    if (s && s.indexOf('error:') === 0) { box.innerHTML = '<p class="db-kpi-note err">Erro ao carregar</p><button type="button" class="db-link" data-retry>Tentar novamente</button>'; return; }
    var ig = D.instagram;
    if (ig.seguidores == null || ig.seguidores === '') {
      box.innerHTML = '<b class="db-kpi-v muted">—</b><p class="db-kpi-note">Ainda sem dados</p><button type="button" class="db-link" data-edit-ig>Adicionar número</button>';
      return;
    }
    var h = ig.historico || [], prev = h.length > 1 ? h[h.length - 2].seguidores : null, delta = prev != null ? ig.seguidores - prev : null;
    box.innerHTML = '<b class="db-kpi-v">' + num(ig.seguidores) + (delta ? '<em class="' + (delta > 0 ? 'up' : 'down') + '">' + (delta > 0 ? '+' : '') + num(delta) + '</em>' : '') + '</b>' +
      '<p class="db-kpi-note">@' + esc(ig.conta) + ' · ' + fmtDate(String(ig.atualizado_em).slice(0, 10)) + ' ' + esc(String(ig.atualizado_em).slice(11, 16)) + '</p>' +
      '<div class="db-kpi-foot"><span class="db-tag">Atualizado manualmente</span><button type="button" class="db-link" data-edit-ig>Atualizar</button></div>';
  }

  /* ---------------- 2. Visitas ---------------- */
  var visits = { state: 'loading', dias: [] };
  function loadVisits() {
    visits.state = 'loading'; renderVisits();
    fetch('/.netlify/functions/visitas', { cache: 'no-store' }).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      if (!r.ok || ct.indexOf('json') < 0) throw new Error('sem fonte');
      return r.json();
    }).then(function (j) {
      visits.dias = (j && j.dias) || [];
      visits.state = visits.dias.length ? 'ok' : 'none';
      renderVisits();
    }).catch(function () { visits.state = 'none'; renderVisits(); });
  }
  function renderVisits() {
    var box = $('#kpi-visits .db-kpi-body');
    if (visits.state === 'loading') { box.innerHTML = '<div class="db-skel"></div>'; return; }
    if (visits.state === 'none') {
      box.innerHTML = '<b class="db-kpi-v muted">—</b><p class="db-kpi-note">Dados ainda não disponíveis</p>' +
        '<details class="db-how"><summary>O que é preciso configurar?</summary><p>O site ainda não tem nenhuma ferramenta a medir visitas. Para ver aqui os últimos 7 e 30 dias e o gráfico, é preciso ativar uma: <b>Netlify Analytics</b> (no painel do Netlify, Site → Analytics), <b>Plausible</b> ou <b>Google Analytics 4</b>, e ligá-la ao painel. Até lá não mostramos números.</p></details>';
      return;
    }
    var d = visits.dias.slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; }).slice(-30);
    var sum = function (arr) { return arr.reduce(function (s, x) { return s + (+x.visitas || 0); }, 0); };
    var v7 = sum(d.slice(-7)), v30 = sum(d);
    var max = Math.max.apply(null, d.map(function (x) { return +x.visitas || 0; }).concat([1]));
    var w = 100 / Math.max(d.length - 1, 1);
    var pts = d.map(function (x, i) { return (i * w).toFixed(2) + ',' + (38 - (x.visitas / max) * 34).toFixed(2); }).join(' ');
    box.innerHTML = '<b class="db-kpi-v">' + num(v7) + '<small> · 7 dias</small></b><p class="db-kpi-note">' + num(v30) + ' nos últimos 30 dias</p>' +
      '<svg class="db-spark" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Evolução das visitas nos últimos 30 dias"><polyline points="0,40 ' + pts + ' 100,40" class="fill"/><polyline points="' + pts + '" class="line"/></svg>';
  }

  /* ---------------- 3. Clientes (pedidos) + indicadores ---------------- */
  function projItems() { return (D.projetos && D.projetos.items) || []; }
  function renderKpis() {
    var items = projItems(), ok = status.projetos === 'ok';
    var ka = $('#kpi-appr .db-kpi-body'), kd = $('#kpi-deliv .db-kpi-body');
    if (!ok) {
      var h = status.projetos === 'loading' ? '<div class="db-skel"></div>' : '<p class="db-kpi-note err">Erro ao carregar</p>';
      ka.innerHTML = h; kd.innerHTML = h; return;
    }
    var pend = items.filter(function (x) { return x.fase === 'aprovacao'; });
    var old = pend.filter(function (x) { return x.prazo && diffDays(x.prazo) <= 0; }).length;
    ka.innerHTML = '<b class="db-kpi-v">' + pend.length + '</b><p class="db-kpi-note">' + (pend.length ? (old ? '<span class="db-pill late">' + old + ' com entrega hoje ou atrasada</span>' : 'projetos a aguardar resposta do cliente') : 'Nada pendente') + '</p>';
    var open = items.filter(function (x) { return x.fase !== 'concluido' && x.prazo; });
    var late = open.filter(function (x) { return diffDays(x.prazo) < 0; }), today = open.filter(function (x) { return diffDays(x.prazo) === 0; });
    var week = open.filter(function (x) { var n = diffDays(x.prazo); return n >= 0 && n <= 7; });
    kd.innerHTML = '<b class="db-kpi-v">' + week.length + '<small> · 7 dias</small></b><p class="db-kpi-note">' +
      (late.length ? '<span class="db-pill late">' + late.length + ' atrasada' + (late.length > 1 ? 's' : '') + '</span>' : '') +
      (today.length ? '<span class="db-pill today">' + today.length + ' hoje</span>' : '') + (!late.length && !today.length ? (week.length ? 'nos próximos 7 dias' : 'Sem entregas esta semana') : '') + '</p>';
  }
  function renderClients() {
    var list = $('#cli-list'), items = projItems();
    var open = items.filter(function (x) { return x.fase !== 'concluido'; });
    $('#cli-count').textContent = status.projetos === 'ok' ? open.length + ' pedido' + (open.length === 1 ? '' : 's') + ' em curso' : '';
    var st = stateBox('projetos');
    if (st) { list.innerHTML = st; return; }
    if (!open.length) { list.innerHTML = '<div class="db-state empty">' + (items.length ? 'Todos os pedidos estão concluídos.' : 'Ainda não há pedidos de clientes.') + '<button type="button" class="db-btn ghost sm" data-add="projetos">Adicionar cliente</button></div>'; return; }
    list.innerHTML = open.slice().sort(function (a, b) { return (a.prazo || '9') < (b.prazo || '9') ? -1 : 1; }).map(function (x) {
      var n = x.prazo ? diffDays(x.prazo) : null, p = parts(x.prazo);
      var cls = n == null ? '' : n < 0 ? 'late' : n === 0 ? 'today' : n <= 2 ? 'soon' : '';
      var badge = n == null ? 'Sem data' : n < 0 ? 'Atrasado · ' + (-n) + (n === -1 ? ' dia' : ' dias') : relDays(n);
      return '<div class="db-row deliv ' + cls + '">' +
        '<div class="db-date">' + (x.prazo ? '<b>' + p.d + '</b><span>' + MES3[p.m - 1] + '</span>' : '<b>–</b>') + '</div>' +
        '<div class="db-row-main"><b>' + esc(x.cliente) + '</b><span>' + esc(x.nome) + '</span><em class="db-due">Entrega ' + (x.prazo ? fmtDate(x.prazo) + ' · ' : '') + badge + '</em></div>' +
        '<div class="db-row-side"><button type="button" class="db-icon-btn" data-edit="projetos" data-id="' + esc(x.id) + '" aria-label="Editar">' + ICON_EDIT + '</button></div></div>';
    }).join('');
  }

  /* ---------------- 4. Estado dos projetos ---------------- */
  var phaseFilter = '';
  function renderStatus() {
    var list = $('#st-list'), chips = $('#st-phases'), items = projItems();
    var active = items.filter(function (x) { return x.fase !== 'concluido'; });
    $('#st-count').textContent = status.projetos === 'ok' ? active.length + ' ativo' + (active.length === 1 ? '' : 's') : '';
    var st = stateBox('projetos');
    if (st) { chips.innerHTML = ''; list.innerHTML = st; return; }
    chips.innerHTML = FASES.map(function (f) {
      var n = items.filter(function (x) { return (x.fase || 'briefing') === f.v; }).length;
      return '<button type="button" class="db-phase ph-' + f.v + (phaseFilter === f.v ? ' on' : '') + '" data-phase="' + f.v + '" aria-pressed="' + (phaseFilter === f.v) + '"><span>' + f.l + '</span><b>' + n + '</b></button>';
    }).join('');
    var showDone = $('#st-done').checked || phaseFilter === 'concluido';
    var show = items.filter(function (x) { return (phaseFilter ? (x.fase || 'briefing') === phaseFilter : true) && (showDone || x.fase !== 'concluido'); });
    var order = {}; FASES.forEach(function (f, i) { order[f.v] = i; });
    show.sort(function (a, b) { return order[a.fase || 'briefing'] - order[b.fase || 'briefing'] || ((a.prazo || '9') < (b.prazo || '9') ? -1 : 1); });
    if (!show.length) { list.innerHTML = '<div class="db-state empty">' + (items.length ? 'Nenhum projeto nesta fase.' : 'Os pedidos que adicionares em Clientes aparecem aqui automaticamente.') + '</div>'; return; }
    list.innerHTML = show.map(function (x) {
      return '<div class="db-row st-row ph-' + esc(x.fase || 'briefing') + '">' +
        '<div class="db-row-main"><b>' + esc(x.cliente) + '</b><span>' + esc(x.nome) + '</span></div>' +
        '<div class="db-row-side"><select class="db-status s-' + esc(x.fase || 'briefing') + '" data-set="projetos" data-id="' + esc(x.id) + '" data-key="fase" aria-label="Estado do projeto">' + opts(FASES, x.fase || 'briefing') + '</select></div></div>';
    }).join('');
  }

  /* ---------------- 6. Calendário dos jogos ---------------- */
  var calMonth = null, calDay = null;
  function renderGames() {
    var cal = $('#games-cal'), list = $('#games-list'), items = (D.jogos && D.jogos.items) || [];
    var t = todayISO();
    if (!calMonth) calMonth = t.slice(0, 7);
    var st = stateBox('jogos');
    if (st) { cal.innerHTML = ''; list.innerHTML = st; return; }
    // calendário do mês
    var y = +calMonth.slice(0, 4), m = +calMonth.slice(5, 7);
    var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var offset = (first + 6) % 7, cells = '';
    var byDay = {};
    items.forEach(function (g) { (byDay[g.data] = byDay[g.data] || []).push(g); });
    for (var i = 0; i < offset; i++) cells += '<span></span>';
    for (var d = 1; d <= days; d++) {
      var iso = calMonth + '-' + String(d).padStart(2, '0'), n = (byDay[iso] || []).length;
      cells += '<button type="button" class="db-day' + (iso === t ? ' today' : '') + (n ? ' has' : '') + (iso === calDay ? ' sel' : '') + (iso < t ? ' past' : '') + '" data-day="' + iso + '" aria-label="' + d + ' de ' + MESES[m - 1] + (n ? ', ' + n + ' jogo' + (n > 1 ? 's' : '') : '') + '">' + d + (n ? '<i>' + (n > 1 ? n : '') + '</i>' : '') + '</button>';
    }
    cal.innerHTML = '<div class="db-cal-h"><button type="button" class="db-icon-btn" data-cal="-1" aria-label="Mês anterior"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button><b>' + MESES[m - 1] + ' ' + y + '</b><button type="button" class="db-icon-btn" data-cal="1" aria-label="Mês seguinte"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div>' +
      '<div class="db-cal-g"><em>S</em><em>T</em><em>Q</em><em>Q</em><em>S</em><em>S</em><em>D</em>' + cells + '</div>';
    // lista
    var show = items.filter(function (g) { return calDay ? g.data === calDay : g.data >= t; })
      .sort(function (a, b) { return (a.data + a.hora) < (b.data + b.hora) ? -1 : 1; });
    var head = calDay ? '<div class="db-list-h"><span>' + fmtLong(calDay) + '</span><button type="button" class="db-link" data-day="">Ver todos os próximos</button></div>' : '<div class="db-list-h"><span>Próximos jogos</span></div>';
    if (!show.length) { list.innerHTML = head + '<div class="db-state empty">' + (calDay ? 'Sem jogos neste dia.' : items.length ? 'Não há jogos marcados daqui para a frente.' : 'Ainda não há jogos no calendário.') + '<button type="button" class="db-btn ghost sm" data-add="jogos">Adicionar jogo</button></div>'; return; }
    var projs = {}; ((D.projetos && D.projetos.items) || []).forEach(function (p) { projs[p.id] = p; });
    var lastDay = '';
    list.innerHTML = head + show.map(function (g) {
      var n = diffDays(g.data), p = projs[g.projeto_id];
      var dayHead = g.data !== lastDay ? '<div class="db-gday' + (n === 0 ? ' today' : '') + '">' + (n === 0 ? 'Hoje · ' : n === 1 ? 'Amanhã · ' : '') + fmtLong(g.data) + '</div>' : '';
      lastDay = g.data;
      return dayHead + '<div class="db-row game' + (n === 0 ? ' today' : '') + '">' +
        '<div class="db-time">' + esc(g.hora || '--:--') + '</div>' +
        '<div class="db-row-main"><b>' + esc(g.casa) + ' <i>vs</i> ' + esc(g.fora) + '</b><span>' + esc(g.competicao) + '</span>' +
        (p ? '<button type="button" class="db-proj-chip" data-open="' + esc(p.id) + '">' + esc(p.nome) + '</button>' : '') + '</div>' +
        '<div class="db-row-side"><button type="button" class="db-icon-btn" data-edit="jogos" data-id="' + esc(g.id) + '" aria-label="Editar jogo">' + ICON_EDIT + '</button></div></div>';
    }).join('');
  }

  /* ---------------- tudo ---------------- */
  function renderAll() {
    var t = todayISO();
    $('#db-today').textContent = fmtLong(t).charAt(0).toUpperCase() + fmtLong(t).slice(1) + ' · o teu negócio num relance';
    renderIG(); renderKpis(); renderClients(); renderStatus(); renderGames();
  }

  // eventos (delegação)
  var dash = $('#tn-dash');
  dash.addEventListener('click', function (e) {
    var el = e.target.closest('button, a, [data-open]');
    if (!el || !dash.contains(el)) return;
    if (el.matches('a[href^="#db-"]')) { e.preventDefault(); var tg = $(el.getAttribute('href')); if (tg) tg.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (el.hasAttribute('data-retry')) { loaded = false; loadAll(true); return; }
    if (el.hasAttribute('data-edit-ig')) { openForm('instagram'); return; }
    if (el.hasAttribute('data-add')) { openForm(el.getAttribute('data-add')); return; }
    if (el.hasAttribute('data-edit')) { openForm(el.getAttribute('data-edit'), el.getAttribute('data-id')); return; }
    if (el.hasAttribute('data-cal')) {
      var y = +calMonth.slice(0, 4), m = +calMonth.slice(5, 7) + (+el.getAttribute('data-cal'));
      if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
      calMonth = y + '-' + String(m).padStart(2, '0'); renderGames(); return;
    }
    if (el.hasAttribute('data-day')) { var dd = el.getAttribute('data-day'); calDay = dd && dd !== calDay ? dd : null; renderGames(); return; }
    if (el.hasAttribute('data-open') && !e.target.closest('select')) { openForm('projetos', el.getAttribute('data-open')); return; }
    if (el.hasAttribute('data-phase')) { var ph = el.getAttribute('data-phase'); phaseFilter = phaseFilter === ph ? '' : ph; renderStatus(); }
  });
  dash.addEventListener('keydown', function (e) {
    var c = e.target.closest && e.target.closest('.db-pcard');
    if (c && e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openForm('projetos', c.getAttribute('data-open')); }
  });
  dash.addEventListener('change', function (e) {
    var s = e.target;
    if (s.id === 'st-done') { renderStatus(); return; }
    if (s.hasAttribute('data-set')) {
      var name = s.getAttribute('data-set'), key = s.getAttribute('data-key');
      quickSet(name, s.getAttribute('data-id'), key, s.value, 'muda estado do projeto');
    }
  });

  // arranque: só depois de entrar e quando o Dashboard está visível
  function maybeLoad() {
    var u = window.netlifyIdentity && window.netlifyIdentity.currentUser && window.netlifyIdentity.currentUser();
    if (u && document.body.classList.contains('tn-on-dash')) loadAll(false);
  }
  window.addEventListener('hashchange', function () { setTimeout(maybeLoad, 0); });
  if (window.netlifyIdentity) {
    window.netlifyIdentity.on('init', function () { setTimeout(maybeLoad, 0); });
    window.netlifyIdentity.on('login', function () { setTimeout(maybeLoad, 0); });
  }
  setTimeout(maybeLoad, 0);
  renderAll();
})();
