/* TENNER. — layout do painel (menu lateral, barra de topo e Dashboard) à volta do Decap CMS */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var body = document.body;
  var id = window.netlifyIdentity;

  /* ---------- sessão ---------- */
  // sem sessão → ecrã de entrar (admin/login.js) · conta pendente → ecrã de espera · aprovada → painel
  var modo = '';
  function setModo(m) {
    modo = m;
    body.classList.toggle('tn-guest', m === 'guest');
    body.classList.toggle('tn-pending', m === 'pending');
    body.classList.toggle('tn-auth', m === 'auth');
  }
  function sessao(user) {
    if (window.TN_PREVIEW) return Promise.resolve(window.TN_PREVIEW_SESSAO || { aprovado: true });
    return user.jwt().then(function (t) {
      return fetch('/.netlify/functions/sessao', { headers: { Authorization: 'Bearer ' + t } });
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = {}; try { d = JSON.parse(t); } catch (e) { d = { erro: 'Resposta inesperada do servidor (' + r.status + ')' }; }
        if (!r.ok) throw new Error(d.erro || ('Erro ' + r.status));
        return d;
      });
    });
  }
  function setUser(user) {
    if (!user || (window.TNLogin && window.TNLogin.temToken())) {
      setModo('guest');
      if (window.TNLogin) window.TNLogin.start();
      return;
    }
    var mail = user.email || '';
    if (window.TNPerfil) window.TNPerfil.aplicar(user);
    $('#tl-wait-mail').textContent = 'Sessão iniciada como ' + mail;
    sessao(user).then(function (d) {
      if (d.aprovado) { setModo('auth'); onRoute(); if (window.TNColab) window.TNColab.contar(); }
      else {
        $('#tl-wait-t').textContent = 'Pedido de acesso enviado';
        $('#tl-wait-p').textContent = 'A tua conta está à espera de aprovação de um administrador da TENNER. Assim que for aprovada, consegues entrar no painel.';
        setModo('pending');
      }
    }).catch(function (err) {
      $('#tl-wait-t').textContent = 'Não foi possível verificar o acesso';
      $('#tl-wait-p').textContent = 'Tenta de novo daqui a pouco. Detalhe: ' + ((err && err.message) || 'sem ligação');
      setModo('pending');
    });
  }
  function sair() { if (id && id.currentUser && id.currentUser()) id.logout(); else location.replace('/admin/'); }
  $('#tn-logout').addEventListener('click', sair);
  $('#tl-wait-out').addEventListener('click', function (e) { e.preventDefault(); sair(); });
  $('#tl-wait-check').addEventListener('click', function () {
    var u = id && id.currentUser && id.currentUser();
    if (!u) return setUser(null);
    var b = this; b.disabled = true; b.textContent = 'A verificar…';
    // renova o token para trazer o papel atualizado
    (u.jwt ? u.jwt(true) : Promise.resolve()).catch(function () {}).then(function () {
      b.disabled = false; b.textContent = 'Verificar de novo'; setUser(u);
    });
  });

  /* ---------- rotas: Dashboard vs. editor ---------- */
  function onRoute() {
    var h = location.hash || '#/dashboard';
    var dash = h === '#/' || h.indexOf('#/dashboard') === 0;
    if (h.indexOf('#/pedir-acesso') === 0 && body.classList.contains('tn-auth')) { location.replace('#/dashboard'); return; }
    var colab = h.indexOf('#/colaboradores') === 0;
    var acessos = h.indexOf('#/pedidos-acesso') === 0;
    var planos = h === '#/planos' || h.indexOf('#/planos?') === 0;
    var arquivo = h === '#/arquivo' || h.indexOf('#/arquivo?') === 0;
    var servicos = h === '#/servicos', extras = h === '#/extras';
    body.classList.toggle('tn-on-dash', dash);
    body.classList.toggle('tn-on-colab', colab);
    body.classList.toggle('tn-on-acessos', acessos);
    body.classList.toggle('tn-on-planos', planos);
    body.classList.toggle('tn-on-arquivo', arquivo);
    body.classList.toggle('tn-on-servicos', servicos);
    body.classList.toggle('tn-on-extras', extras);
    var auth = body.classList.contains('tn-auth');
    if ((colab || acessos) && auth && window.TNColab) window.TNColab.start();
    if (planos && auth && window.TNConteudo) window.TNConteudo.planos();
    if (arquivo && auth && window.TNConteudo) window.TNConteudo.arquivo();
    if (servicos && auth && window.TNConteudo) window.TNConteudo.col('servicos');
    if (extras && auth && window.TNConteudo) window.TNConteudo.col('extras');
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

  /* ---------- pesquisa ---------- */
  $('#tn-search').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('#tn-search-in').value.trim();
    if (q) location.hash = '#/search/' + encodeURIComponent(q);
  });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#tn-search-in').focus(); }
  });

  /* ---------- Dashboard (admin/dash.js) ---------- */
  function loadStats() {
    if (body.classList.contains('tn-auth') && body.classList.contains('tn-on-dash') && window.TNDash) window.TNDash.start();
  }

  /* ---------- arranque ---------- */
  if (id) {
    var cur = id.currentUser && id.currentUser();
    if (cur) setUser(cur);
    var esperou = setTimeout(function () { if (!modo) setUser(id.currentUser && id.currentUser()); }, 2500);
    id.on('init', function (u) { clearTimeout(esperou); setUser(u); });
    id.on('login', function (u) { setUser(u); if (!/^#\/(collections|search|dashboard|colaboradores|pedidos-acesso|planos|arquivo|servicos|extras)/.test(location.hash)) location.hash = '#/dashboard'; });
    id.on('logout', function () { location.replace('/admin/'); });
  } else {
    setUser(null);
  }
  onRoute();
})();
