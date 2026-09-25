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
    $$('.tn-link[data-match]').forEach(function (a) {
      a.classList.toggle('on', new RegExp(a.getAttribute('data-match')).test(h));
    });
    body.classList.remove('tn-menu-open');
    if (dash) loadStats();
  }
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

  // "Imagens e vídeos" abre a biblioteca de media do Decap (o botão original fica escondido no topo do Decap)
  $('#tn-media').addEventListener('click', function () {
    var btn = $$('#nc-root header button').filter(function (b) { return /m[eé]dia|multim/i.test(b.textContent); })[0];
    if (btn) btn.click();
    body.classList.remove('tn-menu-open');
  });

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

  /* ---------- arranque ---------- */
  if (id) {
    setUser(id.currentUser && id.currentUser());
    id.on('init', setUser);
    id.on('login', function (u) { setUser(u); if (!/^#\/(collections|search|dashboard)/.test(location.hash)) location.hash = '#/dashboard'; });
    id.on('logout', function () { setUser(null); location.replace('/admin/'); });
  }
  onRoute();
})();
