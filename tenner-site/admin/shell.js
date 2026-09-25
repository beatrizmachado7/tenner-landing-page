/* TENNER. — layout do painel (menu lateral, barra de topo e Dashboard) à volta do Decap CMS */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var body = document.body;
  var id = window.netlifyIdentity;

  /* ---------- sessão ---------- */
  function setUser(user) {
    body.classList.toggle('tn-auth', !!user);
    if (!user) return;
    var mail = user.email || '';
    var name = (user.user_metadata && user.user_metadata.full_name) || mail.split('@')[0] || 'TENNER.';
    $('#tn-user-name').textContent = name;
    $('#tn-user-mail').textContent = mail;
    $('#tn-avatar').textContent = name.charAt(0).toUpperCase();
    loadStats();
  }
  $('#tn-logout').addEventListener('click', function () {
    if (id) id.logout(); else location.replace('/admin/');
  });

  /* ---------- rotas: Dashboard vs. editor ---------- */
  function onRoute() {
    var h = location.hash || '#/dashboard';
    var dash = h === '#/' || h.indexOf('#/dashboard') === 0;
    body.classList.toggle('tn-on-dash', dash);
    var m = h.match(/^#\/collections\/([^/?]+)/);
    if (m) body.setAttribute('data-col', m[1]); else body.removeAttribute('data-col');
    $$('.tn-link[data-match]').forEach(function (a) {
      a.classList.toggle('on', new RegExp(a.getAttribute('data-match')).test(h));
    });
    body.classList.remove('tn-menu-open');
    if (dash) loadStats();
    if (!/\/entries\//.test(h)) svcCache = {};
    setTimeout(decorateSvc, 50);
    setTimeout(decorateArq, 50);
  }
  // O Decap só carrega os dados de uma entrada quando o editor abre. Ao saltar de uma entrada
  // diretamente para outra (ex.: Pre Match Estático -> Motion Videos) ficava com os dados antigos.
  // Por isso passamos primeiro pela lista da coleção, para o editor fechar e abrir de novo.
  var lastHash = location.hash, bouncing = false;
  var editorRe = /^#\/collections\/([^/]+)\/(entries\/[^/?]+|new)/;
  window.addEventListener('hashchange', function () {
    var h = location.hash;
    if (!bouncing && editorRe.test(lastHash) && editorRe.test(h) && h !== lastHash) {
      bouncing = true;
      var target = h, col = h.match(editorRe)[1];
      location.replace('#/collections/' + col);
      setTimeout(function () { bouncing = false; location.hash = target; }, 150);
      return;
    }
    lastHash = h;
  });
  window.addEventListener('hashchange', onRoute);

  /* ---------- menu ---------- */
  $$('.tn-group-h').forEach(function (b) {
    b.addEventListener('click', function () {
      var g = b.parentNode;
      g.setAttribute('data-open', g.getAttribute('data-open') === 'true' ? 'false' : 'true');
    });
  });
  $('#tn-burger').addEventListener('click', function () { body.classList.toggle('tn-menu-open'); });
  $('#tn-scrim').addEventListener('click', function () { body.classList.remove('tn-menu-open'); });

  /* ---------- pesquisa ---------- */
  $('#tn-search').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('#tn-search-in').value.trim();
    if (q) location.hash = '#/search/' + encodeURIComponent(q);
  });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#tn-search-in').focus(); }
  });

  /* ---------- Dashboard ---------- */
  var set = function (k, v) { $$('[data-k="' + k + '"]').forEach(function (el) { el.textContent = v; }); };
  var bar = function (k, pct) { $$('[data-k="' + k + '"]').forEach(function (el) { el.style.width = Math.max(0, Math.min(100, pct)) + '%'; }); };
  var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };
  var get = function (n) {
    return fetch('/content/' + n + '.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  };
  var loading = false;
  function loadStats() {
    if (loading || !body.classList.contains('tn-auth')) return;
    loading = true;
    Promise.all(['planos', 'arquivo', 'site', 'servicos', 'extras'].map(get)).then(function (r) {
      loading = false;
      var planos = (r[0] && r[0].plans) || [];
      var arq = r[1] || {};
      var site = r[2] || {};
      var fotos = ((arq.estatico || {}).items || []).length;
      var videos = ((arq.motion || {}).items || []).length;
      var cars = ((arq.social || {}).items || []).length;
      var serv = ((r[3] || {}).items || []).length, extras = ((r[4] || {}).items || []).length;

      set('planos', planos.length); set('fotos', fotos); set('videos', videos); set('carrosseis', cars);

      var wa = site.whatsapp || {};
      var hasLink = !!String(wa.link || '').trim();
      var withMsg = planos.filter(function (p) { return p.whatsapp_message || wa.message; }).length;
      set('wa', hasLink ? 'Ligado' : 'Por ligar');
      set('wa-msgs', withMsg + '/' + planos.length + ' mensagens');
      bar('wa-bar', ((hasLink ? 1 : 0) + (planos.length ? withMsg / planos.length : 0)) / 2 * 100);
      set('wa-note', hasLink ? 'Os botões “Quero” abrem o WhatsApp' : 'Falta pôr o número em Definições gerais → WhatsApp');

      var total = fotos + videos + cars;
      var full = [fotos, videos, cars].filter(function (n) { return n >= 3; }).length;
      set('arq', plural(total, 'item', 'itens'));
      set('arq-rows', full + '/3 linhas completas');
      bar('arq-bar', full / 3 * 100);
      set('arq-note', full === 3 ? 'Todas as secções têm pelo menos 3 itens' : 'Cada secção fica completa com 3 itens lado a lado');

      set('q-planos', plural(planos.length, 'plano ativo', 'planos ativos'));
      set('q-fotos', plural(fotos, 'foto', 'fotos'));
      set('q-videos', plural(videos, 'vídeo', 'vídeos'));
      set('q-car', plural(cars, 'carrossel', 'carrosséis'));
      set('q-serv', plural(serv, 'serviço', 'serviços') + ' · ' + plural(extras, 'extra', 'extras'));
    });
  }


  /* ---------- "O que fazemos" e "Serviços extra": cartões verticais com nome, descrição e detalhes ---------- */
  var CARD_COLS = { servicos: 1, extras: 1 };
  var svcCache = {}, svcLoading = {};
  function loadSvc(col, cb) {
    if (svcCache[col]) return cb(svcCache[col]);
    if (svcLoading[col]) return;
    svcLoading[col] = true;
    get(col).then(function (d) {
      svcLoading[col] = false;
      var map = {};
      ((d && d.items) || []).forEach(function (it) { map[String(it.title || '').trim().toLowerCase()] = it; });
      svcCache[col] = map;
      cb(map);
    });
  }
  var escH = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var arrow = '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  function decorateSvc() {
    var col = body.getAttribute('data-col');
    if (!CARD_COLS[col] || /\/entries\//.test(location.hash) || /\/new/.test(location.hash)) return;
    var cards = $$('#nc-root li[class*="-ListCard"]:not([data-tn])');
    if (!cards.length) return;
    loadSvc(col, function (map) {
      cards.forEach(function (li) {
        if (li.getAttribute('data-tn')) return;
        var link = $('a', li), h = $('h2', li);
        if (!link || !h) return;
        var name = h.textContent.trim();
        var it = map[name.toLowerCase()];
        li.setAttribute('data-tn', '1');
        li.classList.add('tn-svc');
        link.innerHTML =
          '<span class="tn-svc-name">' + escH(name) + '</span>' +
          '<span class="tn-svc-desc">' + escH((it && (it.text || it.subtitle)) || 'Carrega para adicionar a descrição.') + '</span>' +
          '<span class="tn-svc-rows">' +
            '<span class="tn-svc-row"><i></i>No site<b class="' + (it ? 'ok' : 'off') + '">' + (it ? 'Visível' : 'Oculto') + '</b></span>' +
          '</span>' +
          '<span class="tn-svc-foot">Editar' + arrow + '</span>';
      });
    });
  }
  var mo = new MutationObserver(function () { if (CARD_COLS[body.getAttribute('data-col')]) decorateSvc(); });
  mo.observe(document.getElementById('nc-root'), { childList: true, subtree: true });


  /* ---------- Arquivo: estado Ativo/Inativo de cada cartão + pré-visualização dos vídeos ---------- */
  function decorateArq() {
    if (body.getAttribute('data-col') !== 'arquivo') return;
    $$('#nc-root [class*="-ListItem"]').forEach(function (li) {
      var own = $$('[role="switch"]', li).filter(function (t) {
        var p = t.parentNode; while (p && p !== li && !(p.className && String(p.className).indexOf('-ListItem') > -1)) p = p.parentNode;
        return p === li;
      })[0];
      if (own) {
        var st = own.getAttribute('aria-checked') === 'true' ? 'on' : 'off';
        if (li.getAttribute('data-tn-state') !== st) li.setAttribute('data-tn-state', st);
        var cc = own.closest('[class*="-ControlContainer"]');
        if (cc && !cc.hasAttribute('data-tn-toggle')) cc.setAttribute('data-tn-toggle', '1');
      }
    });
    $$('#nc-root [class*="-ListItem"] a').forEach(function (a) {
      var src = a.getAttribute('href') || '';
      if (!/\.(mp4|webm|mov)(\?|$)/i.test(src + ' ' + a.textContent) || a.getAttribute('data-tn-v') === src) return;
      a.setAttribute('data-tn-v', src);
      var box = a.parentNode, old = box.querySelector('video.tn-vprev');
      if (old) old.remove();
      var v = document.createElement('video');
      v.className = 'tn-vprev'; v.src = src; v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', '');
      box.insertBefore(v, box.firstChild);
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    });
  }
  var moArq = new MutationObserver(function () { if (body.getAttribute('data-col') === 'arquivo') decorateArq(); });
  moArq.observe(document.getElementById('nc-root'), { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-checked', 'href'] });

  /* ---------- arranque ---------- */
  if (id) {
    setUser(id.currentUser && id.currentUser());
    id.on('init', setUser);
    id.on('login', function (u) { setUser(u); if (!/^#\/(collections|search|dashboard)/.test(location.hash)) location.hash = '#/dashboard'; });
    id.on('logout', function () { setUser(null); location.replace('/admin/'); });
  }
  onRoute();
})();
