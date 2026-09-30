/* TENNER. — páginas Colaboradores (#/colaboradores) e Convites (#/pedidos-acesso)
   Fala com a função /.netlify/functions/colaboradores (Netlify Identity).
   Pré-visualização: com window.TN_PREVIEW = true usa window.TN_PREVIEW_COLAB. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var LINK_PEDIDO = (/^https?:/.test(location.origin) ? location.origin : 'https://tenner10.netlify.app') + '/convite';

  function call(method, body) {
    if (window.TN_PREVIEW) return window.TN_PREVIEW_COLAB(method, body);
    var id = window.netlifyIdentity, u = id && id.currentUser && id.currentUser();
    if (!u) return Promise.reject(new Error('Sessão terminada — volta a entrar'));
    return u.jwt().then(function (t) {
      return fetch('/.netlify/functions/colaboradores', {
        method: method,
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.erro || ('Erro ' + r.status));
        return d;
      });
    });
  }

  var st = { eu: null, admin: false, pessoas: [], carregado: false };
  function status(txt, cls) {
    ['#tn-colab-st', '#tn-acc-st'].forEach(function (s) { var el = $(s); if (el) { el.textContent = txt; el.className = 'tn-save ' + (cls || ''); } });
  }
  var data = function (s) { return s ? new Date(s).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; };
  var ini = function (p) { return (p.nome || p.email).trim().charAt(0).toUpperCase(); };
  var TRASH = '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

  // contador no menu lateral
  function renderBadge() {
    var n = st.pessoas.filter(function (p) { return p.estado === 'aprovacao'; }).length;
    var b = $('#tn-acc-badge'); if (!b) return;
    b.textContent = n; b.hidden = !n;
  }

  /* ---------- Pedidos de acesso ---------- */
  function renderPedidos() {
    var ped = st.pessoas.filter(function (p) { return p.estado === 'aprovacao'; });
    $('[data-k="acc-n"]').textContent = ped.length;
    $('#tn-acc-lock').hidden = st.admin;
    var list = $('#tn-acc-list');
    if (!ped.length) {
      list.innerHTML = '<div class="tn-empty"><b>Sem convites por aprovar</b><span>Quando alguém usar o teu link, o convite aparece aqui.</span></div>';
      return;
    }
    list.innerHTML = ped.map(function (p) {
      return '<div class="tn-row tn-row-pedido">' +
        '<span class="tn-ava">' + esc(ini(p)) + '</span>' +
        '<span class="tn-row-t"><b>' + esc(p.nome || p.email) + '</b><small>' + esc((p.nome ? p.email + ' · ' : '') + 'Pedido recebido a ' + data(p.convidado)) + '</small></span>' +
        '<span class="tn-badge aprovacao">Por aprovar</span>' +
        (st.admin ? '<span class="tn-row-a on tn-acc-a">' +
          '<button type="button" class="tn-btn solid sm" data-c="aprovar" data-id="' + esc(p.id) + '">Aprovar</button>' +
          '<button type="button" class="tn-btn sm" data-c="recusar" data-id="' + esc(p.id) + '">Recusar</button></span>' : '') +
      '</div>';
    }).join('');
  }

  /* ---------- Colaboradores ---------- */
  function renderColab() {
    var gente = st.pessoas.filter(function (p) { return p.estado !== 'aprovacao'; });
    var nped = st.pessoas.length - gente.length;
    $('[data-k="col-n"]').textContent = gente.length;
    $('#tn-invite').classList.toggle('locked', !st.admin);
    $('#tn-inv-lock').hidden = st.admin;
    var aviso = $('#tn-col-pedidos');
    aviso.hidden = !nped;
    aviso.textContent = (nped === 1 ? '1 convite por aprovar' : nped + ' convites por aprovar') + ' →';
    var list = $('#tn-col-list');
    if (!gente.length) {
      list.innerHTML = '<div class="tn-empty"><b>Ainda sem colaboradores</b><span>Convida a primeira pessoa com o formulário acima.</span></div>';
      return;
    }
    list.innerHTML = gente.map(function (p) {
      var eu = p.id === st.eu;
      var sub = p.estado === 'convite' ? 'Convidado a ' + data(p.convidado) + ' · ainda não aceitou' : (p.ultimo ? 'Última entrada a ' + data(p.ultimo) : 'Ativo');
      var acoes = '';
      if (st.admin && !eu) {
        acoes = '<span class="tn-row-a">' +
          (p.estado === 'convite' ? '<button type="button" class="tn-mini-link" data-c="reenviar" data-id="' + esc(p.id) + '">Reenviar</button>' : '') +
          '<button type="button" class="tn-mini-link" data-c="papel" data-id="' + esc(p.id) + '">' + (p.admin ? 'Tirar admin' : 'Tornar admin') + '</button>' +
          '<button type="button" class="tn-icon-btn sm" data-c="remover" data-id="' + esc(p.id) + '" aria-label="Remover acesso de ' + esc(p.email) + '" title="Remover acesso">' + TRASH + '</button>' +
        '</span>';
      }
      var badge = eu ? '<span class="tn-badge eu">Tu</span>'
        : p.estado === 'convite' ? '<span class="tn-badge pendente">Convite pendente</span>'
        : '<span class="tn-badge ativo">Ativo</span>';
      return '<div class="tn-row">' +
        '<span class="tn-ava">' + (p.avatar ? '<img src="' + esc(p.avatar) + '" alt="">' : esc(ini(p))) + '</span>' +
        '<span class="tn-row-t"><b>' + esc(p.nome || p.email) + '</b><small>' + esc((p.bio ? p.bio + ' · ' : '') + (p.nome ? p.email + ' · ' : '') + sub) + '</small></span>' +
        badge +
        '<span class="tn-role' + (p.admin ? ' admin' : '') + '">' + (p.admin ? 'Administrador' : 'Colaborador') + '</span>' +
        acoes + '</div>';
    }).join('');
  }

  function render() { renderBadge(); renderPedidos(); renderColab(); }
  function apply(d) {
    st.eu = d.eu; st.admin = !!d.admin; st.pessoas = d.pessoas || []; st.carregado = true;
    render();
    if (d.promovido) status('Tens agora permissões de administrador', 'ok');
    else if (d.msg) status(d.msg, 'ok');
    else status('Atualizado', 'ok');
  }
  function fail(e) { status(e.message || 'Erro', 'err'); }
  function load(silencioso) {
    if (!silencioso) status('A carregar…', 'busy');
    return call('GET').then(apply).catch(function (e) {
      if (silencioso) return;
      fail(e);
      ['#tn-col-list', '#tn-acc-list'].forEach(function (s) { $(s).innerHTML = '<div class="tn-empty"><b>Não foi possível carregar</b><span>' + esc(e.message) + '</span></div>'; });
    });
  }

  function acao(e) {
    var b = e.target.closest('[data-c]'); if (!b) return;
    var p = st.pessoas.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0]; if (!p) return;
    var c = b.getAttribute('data-c');
    var run = function (method, body, busy) { status(busy, 'busy'); b.disabled = true; call(method, body).then(apply).catch(function (err) { b.disabled = false; fail(err); }); };
    if (c === 'reenviar') run('POST', { email: p.email, reenviar: true }, 'A reenviar convite…');
    else if (c === 'papel') run('PUT', { id: p.id, papel: p.admin ? 'editor' : 'admin' }, 'A atualizar…');
    else if (c === 'aprovar') {
      run('PUT', { id: p.id, papel: 'editor' }, 'A aprovar…');
    } else if (c === 'recusar') {
      window.TNDash.confirm('Recusar convite?', '<b>' + esc(p.email) + '</b> não fica com acesso ao painel.', 'Recusar convite', function () {
        run('DELETE', { id: p.id }, 'A recusar…');
      });
    } else if (c === 'remover') {
      window.TNDash.confirm('Remover acesso?', '<b>' + esc(p.email) + '</b> deixa de conseguir entrar no painel. Podes voltar a convidar mais tarde.', 'Remover acesso', function () {
        run('DELETE', { id: p.id }, 'A remover…');
      });
    }
  }

  function bind() {
    $('#tn-acc-link').value = LINK_PEDIDO;
    $('#tn-acc-copy').addEventListener('click', function () {
      var b = this, inp = $('#tn-acc-link');
      var ok = function () { b.textContent = 'Copiado!'; setTimeout(function () { b.textContent = 'Copiar link'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(ok, function () { inp.select(); document.execCommand('copy'); ok(); });
      else { inp.select(); document.execCommand('copy'); ok(); }
    });
    $('#tn-invite').addEventListener('submit', function (e) {
      e.preventDefault();
      var inp = $('#tn-inv-email'), email = inp.value.trim().toLowerCase();
      if (!EMAIL.test(email)) { status('Escreve um email válido', 'err'); inp.focus(); return; }
      var btn = $('#tn-inv-btn'); btn.disabled = true;
      status('A enviar convite…', 'busy');
      call('POST', { email: email, admin: $('#tn-inv-admin').checked }).then(function (d) {
        inp.value = ''; $('#tn-inv-admin').checked = false; apply(d);
      }).catch(fail).then(function () { btn.disabled = false; });
    });
    $('#tn-col-list').addEventListener('click', acao);
    $('#tn-acc-list').addEventListener('click', acao);
  }

  var bound = false, timer;
  function prep() { if (!bound) { bind(); bound = true; } }
  window.TNColab = {
    start: function () { prep(); load(); },       // ao abrir uma das páginas
    contar: function () {                          // depois de entrar: atualiza o contador do menu
      prep(); load(true);
      clearInterval(timer);
      timer = setInterval(function () { if (!document.hidden) load(true); }, 120000);
    }
  };
})();
