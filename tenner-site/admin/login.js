/* TENNER. — entrar, pedir acesso, recuperar palavra-passe e aceitar convite
   Usa o Netlify Identity (a biblioteca GoTrue que vem com o netlify-identity-widget).
   Quem pede acesso fica pendente até um administrador aprovar em Colaboradores. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function gotrue() {
    if (window.TN_PREVIEW) return window.TN_PREVIEW_GOTRUE;
    var id = window.netlifyIdentity;
    return id && id.gotrue;
  }
  function traduz(e) {
    var m = String((e && (e.json && (e.json.error_description || e.json.msg)) || (e && e.message) || e || '')).toLowerCase();
    if (/invalid.*(password|grant)|no user found|password invalid/.test(m)) return 'Email ou palavra-passe incorretos.';
    if (/not confirmed/.test(m)) return 'Ainda não confirmaste o teu email. Procura o email de confirmação na tua caixa de entrada.';
    if (/already.*registered|already exists/.test(m)) return 'Já existe um pedido ou uma conta com este email.';
    if (/signups not allowed|signup.*disabled/.test(m)) return 'Os convites estão fechados de momento. Fala com a TENNER.';
    if (/expired|invalid.*token|not found/.test(m)) return 'Este link já expirou ou já foi usado. Pede um novo.';
    if (/password.*(short|characters|length)/.test(m)) return 'A palavra-passe é demasiado curta (mínimo 8 caracteres).';
    if (/rate|too many/.test(m)) return 'Demasiadas tentativas. Espera um pouco e tenta de novo.';
    if (/network|failed to fetch/.test(m)) return 'Sem ligação. Verifica a internet e tenta de novo.';
    return 'Não foi possível concluir. Tenta de novo.';
  }

  var views = ['entrar', 'pedir', 'recuperar', 'convite', 'nova', 'aviso'];
  var pedidoEnviado = false;
  function show(v, aviso) {
    views.forEach(function (n) { var f = $('#tl-' + n); if (f) f.hidden = n !== v; });
    var solo = /^#\/pedir-acesso/.test(location.hash) || pedidoEnviado;
    var back = $('#tl-aviso-back'); if (back) back.hidden = solo;
    $$('.tl-msg').forEach(function (m) { m.textContent = ''; m.className = 'tl-msg'; });
    if (aviso) { $('#tl-aviso-t').textContent = aviso.t; $('#tl-aviso-p').textContent = aviso.p; }
    var first = $('#tl-' + v + ' input:not([type=hidden])'); if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function msg(form, txt, cls) { var m = $('.tl-msg', form); m.textContent = txt; m.className = 'tl-msg ' + (cls || ''); }
  function busy(form, on) { var b = $('button[type=submit]', form); b.disabled = on; b.classList.toggle('busy', on); }
  function entrou() { if (window.TN_PREVIEW && window.TN_PREVIEW_ENTROU) window.TN_PREVIEW_ENTROU(); else { location.hash = '#/dashboard'; location.reload(); } }
  function vals(form) { var v = {}; $$('[name]', form).forEach(function (el) { v[el.name] = el.value.trim(); }); return v; }
  function semLigacao(form) { msg(form, 'O sistema de contas ainda não carregou. Atualiza a página.', 'err'); busy(form, false); }

  function bind() {
    $$('[data-tl]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); show(a.getAttribute('data-tl')); }); });
    $$('.tl-eye').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = b.parentNode.querySelector('input'); var vis = i.type === 'text';
        i.type = vis ? 'password' : 'text'; b.setAttribute('aria-label', vis ? 'Mostrar palavra-passe' : 'Esconder palavra-passe'); b.classList.toggle('on', !vis);
      });
    });

    // entrar
    $('#tl-entrar').addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target, v = vals(f), g = gotrue();
      if (!EMAIL.test(v.email)) return msg(f, 'Escreve um email válido.', 'err');
      if (!v.password) return msg(f, 'Escreve a palavra-passe.', 'err');
      if (!g) return semLigacao(f);
      busy(f, true); msg(f, 'A entrar…');
      g.login(v.email, v.password, true).then(entrou).catch(function (err) { busy(f, false); msg(f, traduz(err), 'err'); });
    });
    // pedir acesso pelo link de convite (só email)
    $('#tl-pedir').addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target, v = vals(f);
      if (!EMAIL.test(v.email)) return msg(f, 'Escreve um email válido.', 'err');
      busy(f, true); msg(f, 'A enviar…');
      var enviar = window.TN_PREVIEW ? Promise.resolve({ ok: true }) :
        fetch('/.netlify/functions/pedir-acesso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.erro || 'Não foi possível enviar.'); return d; }); });
      enviar.then(function () {
        busy(f, false); f.reset(); pedidoEnviado = true;
        show('aviso', { t: 'Pedido enviado', p: 'Obrigado! A TENNER vai analisar o teu pedido. Se for aprovado, recebes um email em ' + v.email + ' para criares a tua palavra-passe e entrares no painel.' });
      }).catch(function (err) { busy(f, false); msg(f, err.message || 'Não foi possível enviar. Tenta de novo.', 'err'); });
    });
    // recuperar
    $('#tl-recuperar').addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target, v = vals(f), g = gotrue();
      if (!EMAIL.test(v.email)) return msg(f, 'Escreve um email válido.', 'err');
      if (!g) return semLigacao(f);
      busy(f, true); msg(f, 'A enviar…');
      g.requestPasswordRecovery(v.email).catch(function () {}).then(function () {
        busy(f, false);
        show('aviso', { t: 'Verifica o teu email', p: 'Se existir uma conta com ' + v.email + ', vais receber um link para criares uma nova palavra-passe.' });
      });
    });
    // aceitar convite
    $('#tl-convite').addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target, v = vals(f), g = gotrue(), t = window.TN_TOKEN;
      if (v.password.length < 8) return msg(f, 'A palavra-passe precisa de ter pelo menos 8 caracteres.', 'err');
      if (!g || !t) return semLigacao(f);
      busy(f, true); msg(f, 'A criar a tua conta…');
      g.acceptInvite(t.token, v.password, true).then(function (u) {
        window.TN_TOKEN = null;
        return v.nome && u && u.update ? u.update({ data: { full_name: v.nome } }).catch(function () {}) : null;
      }).then(entrou).catch(function (err) { busy(f, false); msg(f, traduz(err), 'err'); });
    });
    // nova palavra-passe (depois do link de recuperação)
    $('#tl-nova').addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target, v = vals(f);
      if (v.password.length < 8) return msg(f, 'A palavra-passe precisa de ter pelo menos 8 caracteres.', 'err');
      if (!recUser) return semLigacao(f);
      busy(f, true); msg(f, 'A guardar…');
      recUser.update({ password: v.password }).then(entrou).catch(function (err) { busy(f, false); msg(f, traduz(err), 'err'); });
    });
  }

  var recUser = null;
  function tratarToken() { // links dos emails (convite, confirmação, recuperação)
    var t = window.TN_TOKEN; if (!t) return false;
    if (t.tipo === 'erro') { show('aviso', { t: 'Link inválido', p: 'Este link já expirou ou já foi usado. Pede um novo convite ou recupera a palavra-passe.' }); return true; }
    if (t.tipo === 'invite_token') { show('convite'); return true; }
    var g = gotrue();
    if (!g) { show('aviso', { t: 'Quase lá', p: 'Atualiza a página para continuar.' }); return true; }
    if (t.tipo === 'confirmation_token') {
      show('aviso', { t: 'A confirmar o teu email…', p: '' });
      g.confirm(t.token, true).then(function () { window.TN_TOKEN = null; entrou(); })
        .catch(function (err) { show('aviso', { t: 'Não foi possível confirmar', p: traduz(err) }); });
      return true;
    }
    if (t.tipo === 'recovery_token') {
      show('aviso', { t: 'A validar o link…', p: '' });
      g.recover(t.token, true).then(function (u) { recUser = u; window.TN_TOKEN = null; show('nova'); })
        .catch(function (err) { show('aviso', { t: 'Não foi possível recuperar', p: traduz(err) }); });
      return true;
    }
    show('aviso', { t: 'Link inválido', p: 'Este link não é suportado. Entra com o teu email e palavra-passe.' });
    return true;
  }

  var started = false;
  window.TNLogin = {
    // chamado pelo shell.js quando não há sessão
    start: function () {
      if (!started) { bind(); started = true; }
      if (!tratarToken()) show(/^#\/pedir-acesso/.test(location.hash) ? 'pedir' : 'entrar');
    },
    temToken: function () { return !!window.TN_TOKEN; }
  };
})();
