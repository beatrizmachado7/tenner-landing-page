/* TENNER. — Dashboard: Planos (orçamentos e renovações), Clientes e Estado dos trabalhos
   Os dados ficam no Netlify Blobs (função /.netlify/functions/painel).
   Guardar aqui NÃO cria uma nova publicação do site (não gasta créditos de deploy).
   Datas das renovações: admin/datas.js (fuso horário de Portugal).
   Pré-visualização: com window.TN_PREVIEW = true usa window.TN_PREVIEW_BACKEND. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var D = window.TNDatas;
  var PREVIEW = !!window.TN_PREVIEW;
  var ESTADOS = [
    { id: 'por-comecar', nome: 'Por começar' },
    { id: 'em-producao', nome: 'Em produção' },
    { id: 'em-revisao', nome: 'Em revisão' },
    { id: 'entregue', nome: 'Entregue' }
  ];
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var hoje = function () { return D.hojePT(); };
  var fmtData = D.curta;
  var iniciais = function (n) { return String(n).trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase(); };
  var byNome = function (a, b) { return a.nome.localeCompare(b.nome, 'pt'); };
  var find = function (arr, id) { return arr.filter(function (x) { return x.id === id; })[0]; };
  var ICON = {
    edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    del: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    wa: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>'
  };

  var state = {
    clientes: [], trabalhos: [], assinaturas: [], pedidos: [], rev: 0,
    filtroEstado: '', filtroCliente: '', histPed: false, histRen: false
  };
  var decisoes = {}; // pedidos aceites/recusados ainda por gravar
  var planos = ['TENNER', 'TENNER+', 'TENNER PRO'];

  /* ---------- contactos ---------- */
  var digitos = function (t) { return String(t || '').replace(/\D/g, ''); };
  var pareceTelefone = function (t) { var s = String(t || '').trim(); return /^[+\d\s().-]{9,}$/.test(s) && digitos(s).length >= 9; };
  function waNumero(t) { // número para wa.me (assume Portugal se tiver 9 dígitos)
    var d = digitos(t);
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.length === 9) d = '351' + d;
    return d.length >= 10 && d.length <= 15 ? d : '';
  }
  var tel9 = function (t) { var d = digitos(t); return d.length >= 9 ? d.slice(-9) : ''; };
  var normNome = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); };
  function waCliente(c) { return c ? (waNumero(c.whatsapp) || (pareceTelefone(c.contacto) ? waNumero(c.contacto) : '')) : ''; }
  function procurarCliente(p) { // evita fichas duplicadas: telefone → email → nome
    var t = tel9(p.telefone), e = String(p.email || '').toLowerCase(), n = normNome(p.nome);
    return (t && state.clientes.filter(function (c) { return tel9(c.whatsapp) === t || tel9(c.contacto) === t; })[0]) ||
      (e && state.clientes.filter(function (c) { return String(c.contacto || '').toLowerCase().indexOf(e) > -1; })[0]) ||
      (n && state.clientes.filter(function (c) { return normNome(c.nome) === n; })[0]) || null;
  }

  /* ---------- planos ativos / renovações ---------- */
  function terminada(a, h) { return a.estado === 'terminado' || (a.termina && (h || hoje()) > a.termina); }
  function ativaDe(clienteId) {
    var h = hoje();
    return state.assinaturas.filter(function (a) { return a.cliente === clienteId && !terminada(a, h); })[0] || null;
  }
  function planoDoCliente(c) {
    var a = ativaDe(c.id);
    if (a) return a.plano;
    var teve = state.assinaturas.some(function (x) { return x.cliente === c.id; });
    return teve ? '' : (c.plano || '');
  }
  function fase(a, h) {
    if (terminada(a, h)) return 'terminado';
    if (a.resposta === 'nao') return 'termina';
    if (h > a.proxima) return 'por-confirmar';
    if (h === a.proxima) return 'hoje';
    if (h === D.somaDias(a.proxima, -1)) return 'amanha';
    return 'ativo';
  }
  var FASE = {
    ativo: { t: 'Ativo', c: 'ok' },
    amanha: { t: 'Renova amanhã', c: 'gold' },
    hoje: { t: 'Renova hoje', c: 'gold' },
    'por-confirmar': { t: 'Renovação por confirmar', c: 'warn' },
    termina: { t: 'Termina', c: 'mute' },
    terminado: { t: 'Terminado', c: 'mute' }
  };
  var RESP = { '': 'Resposta do cliente…', aguardar: 'A aguardar resposta', continua: 'Vai continuar', nao: 'Não vai continuar' };
  function msgRenovacao(nome, plano, data, h) {
    var primeiro = String(nome).trim().split(/\s+/)[0];
    var quando = h === data ? 'renova hoje, ' + D.porExtenso(data) : h > data ? 'renovava a ' + D.porExtenso(data) : 'renova amanhã, ' + D.porExtenso(data);
    return 'Olá, ' + primeiro + '! O teu plano ' + plano + ' da TENNER ' + quando + '. Gostarias de continuar connosco no próximo mês?';
  }
  function hist(a, tipo, nota, data) { a.historico = a.historico || []; a.historico.push({ data: data || hoje(), tipo: tipo, nota: nota || '' }); }

  // mantém tudo coerente: planos que já terminaram passam a "terminado" e deixam de aparecer na ficha do cliente
  function sincronizar() {
    var h = hoje(), mudou = false;
    state.assinaturas.forEach(function (a) {
      if (a.estado === 'ativo' && a.termina && h > a.termina) {
        a.estado = 'terminado'; hist(a, 'terminado', 'Plano terminado', a.termina); mudou = true;
        var c = find(state.clientes, a.cliente);
        if (c && c.plano === a.plano && !ativaDe(c.id)) c.plano = '';
      }
    });
    state.clientes.forEach(function (c) { // contactos antigos: telefone no campo "contacto" passa para "whatsapp"
      if (!c.whatsapp && pareceTelefone(c.contacto)) { c.whatsapp = c.contacto; c.contacto = ''; mudou = true; }
    });
    return mudou;
  }

  /* ---------- API ---------- */
  function token() {
    var id = window.netlifyIdentity, u = id && id.currentUser && id.currentUser();
    return u ? u.jwt() : Promise.reject(new Error('sem sessão'));
  }
  function api(path, opts) {
    return token().then(function (t) {
      opts = opts || {};
      opts.headers = Object.assign({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, opts.headers || {});
      return fetch('/.netlify/functions/' + path, opts);
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.erro || ('HTTP ' + r.status)); e.status = r.status; e.data = d; throw e; }
        return d;
      });
    });
  }
  var backend = PREVIEW ? window.TN_PREVIEW_BACKEND : {
    load: function () { return api('painel'); },
    save: function (d) { return api('painel', { method: 'PUT', body: JSON.stringify(d) }); },
    planos: function () {
      return fetch('/content/planos.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
        .then(function (d) { return (d.plans || []).map(function (p) { return (p.name + (p.suffix ? ' ' + p.suffix : '')).trim(); }); });
    }
  };
  function aplicar(d) {
    state.clientes = d.clientes || []; state.trabalhos = d.trabalhos || [];
    state.assinaturas = d.assinaturas || []; state.pedidos = d.pedidos || []; state.rev = Number(d.rev) || 0;
  }

  /* ---------- guardar (em fila, com controlo de versão) ---------- */
  var saveTimer, saving = false, inFlight = false, again = false;
  function status(txt, cls) {
    var el = $('#tn-save'); if (!el) return;
    el.textContent = txt; el.className = 'tn-save ' + (cls || '');
  }
  function persist() {
    status('A guardar…', 'busy');
    saving = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 350);
  }
  function flush() {
    if (inFlight) { again = true; return; }
    inFlight = true;
    var enviados = Object.keys(decisoes).map(function (k) { return decisoes[k]; });
    backend.save({ rev: state.rev, clientes: state.clientes, trabalhos: state.trabalhos, assinaturas: state.assinaturas, pedidos: enviados })
      .then(function (d) {
        enviados.forEach(function (p) { if (decisoes[p.id] === p) delete decisoes[p.id]; });
        state.rev = Number(d.rev) || state.rev + 1;
        if (d.pedidos) state.pedidos = mergePedidos(d.pedidos);
        inFlight = false;
        if (again) { again = false; flush(); return; }
        saving = false; status('Guardado', 'ok'); renderPlanos();
      })
      .catch(function (e) {
        inFlight = false; again = false; saving = false;
        if (e.status === 409 && e.data) {
          decisoes = {}; aplicar(e.data); sincronizar(); render();
          status('Alguém alterou os dados entretanto — já atualizei. Repete a última alteração.', 'err');
        } else status('Erro ao guardar — tenta de novo', 'err');
      });
  }
  function mergePedidos(lista) { // mantém decisões locais ainda não gravadas
    return lista.map(function (p) { return decisoes[p.id] ? Object.assign({}, p, decisoes[p.id]) : p; });
  }

  /* ---------- Planos: orçamentos e renovações ---------- */
  function renderPlanos() {
    var h = hoje();
    // pedidos de orçamento (só se a área existir no painel)
    if ($('#tn-ped-list')) renderPedidos(h);
    renderRenovacoes(h);
  }
  function renderPedidos(h) {
    var pend = state.pedidos.filter(function (p) { return p.estado === 'pendente'; });
    var feitos = state.pedidos.filter(function (p) { return p.estado !== 'pendente'; });
    $('[data-k="ped-n"]').textContent = pend.length;
    var hp = $('#tn-ped-hist');
    hp.textContent = state.histPed ? 'Ver pendentes' : 'Histórico (' + feitos.length + ')';
    hp.hidden = !feitos.length && !state.histPed;
    var lp = $('#tn-ped-list');
    if (state.histPed) {
      lp.innerHTML = feitos.length ? feitos.map(function (p) {
        var c = p.cliente && find(state.clientes, p.cliente);
        return '<div class="tn-item">' +
          '<div class="tn-item-m"><b>' + esc(p.nome) + '</b><span class="tn-tag">' + esc(p.plano) + '</span></div>' +
          '<small>' + (p.estado === 'aceite' ? 'Aceite' : 'Recusado') + ' a ' + fmtData(p.decidido) + ' · pedido a ' + fmtData(String(p.criado).slice(0, 10)) +
            (p.estado === 'aceite' && !c ? ' · ficha apagada' : '') + '</small>' +
          '<span class="tn-badge ' + (p.estado === 'aceite' ? 'ativo' : 'recusado') + '">' + (p.estado === 'aceite' ? 'Aceite' : 'Recusado') + '</span>' +
        '</div>';
      }).join('') : '<div class="tn-empty sm"><span>Sem histórico.</span></div>';
    } else {
      lp.innerHTML = pend.length ? pend.map(function (p) {
        var dia = String(p.criado).slice(0, 10);
        return '<div class="tn-item">' +
          '<div class="tn-item-m"><b>' + esc(p.nome) + '</b><span class="tn-tag">' + esc(p.plano) + '</span></div>' +
          '<small>' + esc([p.telefone, p.email].filter(Boolean).join(' · ')) + ' · ' + (dia === h ? 'hoje' : fmtData(dia)) + '</small>' +
          (p.mensagem ? '<p class="tn-item-msg">“' + esc(p.mensagem) + '”</p>' : '') +
          '<div class="tn-item-a">' +
            '<button type="button" class="tn-btn solid sm" data-act="ped-aceitar" data-id="' + esc(p.id) + '">' + ICON.ok + 'Aceitar</button>' +
            '<button type="button" class="tn-btn sm" data-act="ped-recusar" data-id="' + esc(p.id) + '">' + ICON.x + 'Recusar</button>' +
          '</div></div>';
      }).join('') : '<div class="tn-empty sm"><b>Sem pedidos pendentes</b><span>Os pedidos do formulário do site aparecem aqui.</span></div>';
    }

  }
  function renderRenovacoes(h) {
    var ativas = state.assinaturas.filter(function (a) { return !terminada(a, h); });
    var ordem = { 'por-confirmar': 0, hoje: 1, amanha: 2, termina: 3, ativo: 4 };
    ativas.sort(function (a, b) { return (ordem[fase(a, h)] - ordem[fase(b, h)]) || a.proxima.localeCompare(b.proxima); });
    var fim = state.assinaturas.filter(function (a) { return terminada(a, h); });
    $('[data-k="ren-n"]').textContent = ativas.length;
    var hr = $('#tn-ren-hist');
    hr.textContent = state.histRen ? 'Ver ativos' : 'Histórico';
    hr.hidden = !state.assinaturas.length;
    var lr = $('#tn-ren-list');
    if (state.histRen) {
      var todas = state.assinaturas.slice().sort(function (a, b) { return b.inicio.localeCompare(a.inicio); });
      lr.innerHTML = todas.length ? todas.map(function (a) {
        var c = find(state.clientes, a.cliente) || { nome: '—' };
        var log = (a.historico || []).slice(-6).reverse().map(function (x) { return '<li>' + fmtData(x.data) + ' · ' + esc(x.nota || x.tipo) + '</li>'; }).join('');
        return '<div class="tn-item">' +
          '<div class="tn-item-m"><b>' + esc(c.nome) + '</b><span class="tn-tag">' + esc(a.plano) + '</span></div>' +
          '<small>Início a ' + fmtData(a.inicio) + (terminada(a, h) ? ' · terminou a ' + fmtData(a.termina || a.proxima) : ' · ativo') + '</small>' +
          (log ? '<ul class="tn-log">' + log + '</ul>' : '') +
        '</div>';
      }).join('') : '<div class="tn-empty sm"><span>Sem histórico.</span></div>';
      return;
    }
    if (!ativas.length) {
      lr.innerHTML = '<div class="tn-empty sm"><b>Sem planos ativos</b><span>Carrega em «Ativar plano» quando um cliente começar um plano.' + (fim.length ? ' Os terminados estão no histórico.' : '') + '</span></div>';
      return;
    }
    lr.innerHTML = ativas.map(function (a) {
      var c = find(state.clientes, a.cliente) || { nome: '—' };
      var f = fase(a, h), F = FASE[f];
      var janela = h >= D.somaDias(a.proxima, -1);
      var info = f === 'termina' ? 'Cliente não vai continuar' :
        f === 'por-confirmar' ? 'Renovação era a ' + fmtData(a.proxima) : 'Próxima renovação: ' + fmtData(a.proxima);
      var html = '<div class="tn-item ren-' + f + '">' +
        '<div class="tn-item-m"><b>' + esc(c.nome) + '</b><span class="tn-tag">' + esc(a.plano) + '</span></div>' +
        '<small>' + info + (a.resposta === 'aguardar' ? ' · a aguardar resposta' : '') + '</small>' +
        '<span class="tn-badge f-' + F.c + '">' + (f === 'termina' ? 'Termina em ' + fmtData(a.termina) : F.t) + '</span>';
      if (janela) {
        var num = waCliente(c);
        html += '<div class="tn-item-a">';
        if (f !== 'termina') {
          if (num) {
            html += '<a class="tn-btn solid sm" href="https://wa.me/' + num + '?text=' + encodeURIComponent(msgRenovacao(c.nome, a.plano, a.proxima, h)) + '" target="_blank" rel="noopener">' + ICON.wa + 'Enviar mensagem</a>';
            html += a.mensagem
              ? '<span class="tn-sent">' + ICON.ok + 'Mensagem enviada a ' + fmtData(a.mensagem) + ' <button type="button" class="tn-mini-link" data-act="ren-desfazer" data-id="' + esc(a.id) + '">anular</button></span>'
              : '<button type="button" class="tn-btn sm" data-act="ren-enviada" data-id="' + esc(a.id) + '">Mensagem enviada</button>';
          } else {
            html += '<span class="tn-warn">Falta o WhatsApp de ' + esc(c.nome.split(' ')[0]) + ' para enviar a mensagem.</span>' +
              '<button type="button" class="tn-btn sm" data-act="edit-cli" data-id="' + esc(c.id || '') + '">Adicionar contacto</button>';
          }
        }
        html += '<label class="tn-sel sm"><select data-act="ren-resposta" data-id="' + esc(a.id) + '" aria-label="Resposta de ' + esc(c.nome) + '">' +
          ['', 'aguardar', 'continua', 'nao'].map(function (r) {
            return '<option value="' + r + '"' + (a.resposta === r ? ' selected' : '') + (r === '' ? ' disabled' : '') + '>' + RESP[r] + '</option>';
          }).join('') + '</select><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></label>';
        html += '</div>';
      }
      return html + '</div>';
    }).join('');
  }

  function aceitarPedido(id) {
    var p = find(state.pedidos, id); if (!p) return;
    var match = procurarCliente(p);
    var opts = [{ v: '__novo', t: 'Criar nova ficha de cliente' }].concat(state.clientes.slice().sort(byNome).map(function (c) {
      return { v: c.id, t: 'Associar a: ' + c.nome + (c.whatsapp ? ' · ' + c.whatsapp : '') };
    }));
    var planoOpts = planos.indexOf(p.plano) > -1 ? planos : [p.plano].concat(planos);
    openDialog('Aceitar pedido', [
      'Confirma os dados. O plano fica ativo a partir da data de início e a primeira renovação é um mês depois.' + (match ? ' Encontrei uma ficha parecida — já está selecionada.' : ''),
      { name: 'nome', label: 'Nome', required: true },
      { name: 'whatsapp', label: 'Telemóvel (WhatsApp)', half: true, type: 'tel' },
      { name: 'email', label: 'Email', half: true, type: 'email' },
      { name: 'plano', label: 'Plano', type: 'select', required: true, options: planoOpts, half: true },
      { name: 'inicio', label: 'Data de início', type: 'date', required: true, half: true },
      { name: 'ficha', label: 'Ficha do cliente', type: 'select', required: true, options: opts },
      'Se o cliente já tiver um plano ativo, é substituído por este.'
    ], { nome: p.nome, whatsapp: p.telefone, email: p.email, plano: p.plano, inicio: hoje(), ficha: match ? match.id : '__novo' }, 'Aceitar e ativar plano', function (v) {
      if (!v.nome || !v.plano || !D || !/^\d{4}-\d{2}-\d{2}$/.test(v.inicio)) { status('Faltam dados para aceitar o pedido', 'err'); return; }
      var c = v.ficha !== '__novo' ? find(state.clientes, v.ficha) : null;
      if (!c) {
        c = { id: uid(), nome: v.nome, clube: '', plano: v.plano, whatsapp: v.whatsapp, contacto: v.email, desde: v.inicio };
        state.clientes.push(c);
      } else {
        if (!c.whatsapp && v.whatsapp) c.whatsapp = v.whatsapp;
        if (!c.contacto && v.email) c.contacto = v.email;
        if (!c.desde) c.desde = v.inicio;
        c.plano = v.plano;
        var velha = ativaDe(c.id);
        if (velha) { velha.estado = 'terminado'; velha.termina = D.somaDias(v.inicio, -1) < velha.inicio ? velha.inicio : D.somaDias(v.inicio, -1); hist(velha, 'substituido', 'Substituído pelo plano ' + v.plano); }
      }
      var dia = D.diaDe(v.inicio);
      var a = { id: uid(), cliente: c.id, plano: v.plano, inicio: v.inicio, dia: dia, proxima: D.mesSeguinte(v.inicio, dia), estado: 'ativo', resposta: '', mensagem: '', termina: '', pedido: p.id, historico: [] };
      hist(a, 'inicio', 'Plano ' + v.plano + ' ativado (pedido de orçamento aceite)', v.inicio);
      state.assinaturas.push(a);
      var dec = { id: p.id, estado: 'aceite', cliente: c.id, assinatura: a.id, decidido: hoje() };
      decisoes[p.id] = dec; Object.assign(p, dec);
      render(); persist();
    });
  }
  // ativar um plano manualmente (cliente que falou connosco pelo WhatsApp, por exemplo)
  function ativarPlano() {
    var opts = [{ v: '__novo', t: 'Novo cliente' }].concat(state.clientes.slice().sort(byNome).map(function (c) {
      return { v: c.id, t: c.nome + (c.whatsapp ? ' · ' + c.whatsapp : '') };
    }));
    openDialog('Ativar plano', [
      'O plano fica ativo a partir da data de início e a primeira renovação é um mês depois. Se o cliente já tiver um plano ativo, é substituído por este.',
      { name: 'ficha', label: 'Cliente', type: 'select', required: true, options: opts },
      { name: 'nome', label: 'Nome (só para novo cliente)' },
      { name: 'whatsapp', label: 'Telemóvel (WhatsApp)', type: 'tel', half: true },
      { name: 'plano', label: 'Plano', type: 'select', required: true, options: planos, half: true },
      { name: 'inicio', label: 'Data de início', type: 'date', required: true }
    ], { ficha: state.clientes.length ? '' : '__novo', plano: planos[0], inicio: hoje() }, 'Ativar plano', function (v) {
      var c = v.ficha !== '__novo' ? find(state.clientes, v.ficha) : null;
      if (!c && !v.nome) { status('Escreve o nome do novo cliente', 'err'); return; }
      if (!v.plano || !/^\d{4}-\d{2}-\d{2}$/.test(v.inicio)) { status('Falta o plano ou a data de início', 'err'); return; }
      if (!c) { c = { id: uid(), nome: v.nome, clube: '', plano: v.plano, whatsapp: v.whatsapp, contacto: '', desde: v.inicio }; state.clientes.push(c); }
      else {
        if (!c.whatsapp && v.whatsapp) c.whatsapp = v.whatsapp;
        if (!c.desde) c.desde = v.inicio;
        c.plano = v.plano;
        var velha = ativaDe(c.id);
        if (velha) { velha.estado = 'terminado'; velha.termina = D.somaDias(v.inicio, -1) < velha.inicio ? velha.inicio : D.somaDias(v.inicio, -1); hist(velha, 'substituido', 'Substituído pelo plano ' + v.plano); }
      }
      var dia = D.diaDe(v.inicio);
      var a = { id: uid(), cliente: c.id, plano: v.plano, inicio: v.inicio, dia: dia, proxima: D.mesSeguinte(v.inicio, dia), estado: 'ativo', resposta: '', mensagem: '', termina: '', pedido: '', historico: [] };
      hist(a, 'inicio', 'Plano ' + v.plano + ' ativado', v.inicio);
      state.assinaturas.push(a);
      render(); persist();
    });
  }
  function recusarPedido(id) {
    var p = find(state.pedidos, id); if (!p) return;
    openDialog('Recusar pedido?', ['O pedido de <b>' + esc(p.nome) + '</b> (' + esc(p.plano) + ') fica no histórico como recusado e não cria nenhum plano.'], {}, 'Recusar pedido', function () {
      var dec = { id: p.id, estado: 'recusado', cliente: '', assinatura: '', decidido: hoje() };
      decisoes[p.id] = dec; Object.assign(p, dec);
      render(); persist();
    }, true);
  }
  function responder(id, r, sel) {
    var a = find(state.assinaturas, id); if (!a) return;
    var c = find(state.clientes, a.cliente) || { nome: '—' };
    var voltar = function () { if (sel) sel.value = a.resposta; };
    if (r === 'continua') {
      var nova = D.mesSeguinte(a.proxima, a.dia);
      openDialog('Confirmar renovação', ['<b>' + esc(c.nome) + '</b> continua com o plano ' + esc(a.plano) + '. A renovação de ' + fmtData(a.proxima) + ' fica registada e a próxima passa para <b>' + fmtData(nova) + '</b>.'], {}, 'Confirmar renovação', function () {
        hist(a, 'renovado', 'Renovação de ' + fmtData(a.proxima) + ' confirmada' + (a.mensagem ? ' (mensagem enviada a ' + fmtData(a.mensagem) + ')' : ''));
        a.proxima = nova; a.resposta = ''; a.mensagem = ''; a.termina = '';
        render(); persist();
      }, false);
      onCancel = voltar;
    } else if (r === 'nao') {
      openDialog('Não vai continuar?', ['O plano ' + esc(a.plano) + ' de <b>' + esc(c.nome) + '</b> termina em <b>' + fmtData(a.proxima) + '</b> e deixa de aparecer como ativo depois dessa data.'], {}, 'Confirmar fim do plano', function () {
        a.resposta = 'nao'; a.termina = a.proxima;
        hist(a, 'nao-continua', 'Cliente não vai continuar · termina em ' + fmtData(a.termina));
        render(); persist();
      }, true);
      onCancel = voltar;
    } else if (r === 'aguardar') {
      if (a.resposta === 'nao') { a.termina = ''; hist(a, 'reaberto', 'Fim do plano anulado'); }
      a.resposta = 'aguardar'; hist(a, 'aguardar', 'A aguardar resposta'); render(); persist();
    }
  }

  /* ---------- Clientes ---------- */
  var nomeCliente = function (id) { var c = find(state.clientes, id); return c ? c.nome : '—'; };
  function renderClientes() {
    var list = $('#tn-cli-list');
    $('[data-k="cli-n"]').textContent = state.clientes.length;
    if (!state.clientes.length) {
      list.innerHTML = '<div class="tn-empty"><b>Ainda sem clientes</b><span>Adiciona o primeiro cliente ou aceita um pedido de orçamento.</span></div>';
      return;
    }
    list.innerHTML = state.clientes.slice().sort(byNome).map(function (c) {
      var ativos = state.trabalhos.filter(function (t) { return t.cliente === c.id && t.estado !== 'entregue'; }).length;
      var plano = planoDoCliente(c);
      return '<div class="tn-row">' +
        '<span class="tn-ava">' + esc(iniciais(c.nome)) + '</span>' +
        '<span class="tn-row-t"><b>' + esc(c.nome) + '</b><small>' + esc([c.clube, c.whatsapp, c.contacto].filter(Boolean).join(' · ') || 'Sem detalhes') + '</small></span>' +
        (plano ? '<span class="tn-tag">' + esc(plano) + '</span>' : '') +
        '<button type="button" class="tn-mini-link" data-act="ver-cli" data-id="' + esc(c.id) + '">' + (ativos ? ativos + ' em curso' : 'Sem trabalhos') + '</button>' +
        '<span class="tn-row-a">' +
          '<button type="button" class="tn-icon-btn sm" data-act="edit-cli" data-id="' + esc(c.id) + '" aria-label="Editar ' + esc(c.nome) + '" title="Editar">' + ICON.edit + '</button>' +
          '<button type="button" class="tn-icon-btn sm" data-act="del-cli" data-id="' + esc(c.id) + '" aria-label="Apagar ' + esc(c.nome) + '" title="Apagar">' + ICON.del + '</button>' +
        '</span></div>';
    }).join('');
  }

  /* ---------- Trabalhos ---------- */
  function renderTrabalhos() {
    var all = state.trabalhos;
    $('#tn-est-pills').innerHTML = '<button type="button" class="tn-pill' + (state.filtroEstado ? '' : ' on') + '" data-est="">Todos <i>' + all.length + '</i></button>' +
      ESTADOS.map(function (e) {
        var n = all.filter(function (t) { return t.estado === e.id; }).length;
        return '<button type="button" class="tn-pill st-' + e.id + (state.filtroEstado === e.id ? ' on' : '') + '" data-est="' + e.id + '"><span class="dot"></span>' + e.nome + ' <i>' + n + '</i></button>';
      }).join('');
    var ent = all.filter(function (t) { return t.estado === 'entregue'; }).length;
    $('[data-k="tr-pct"]').textContent = all.length ? Math.round(ent / all.length * 100) + '% entregue' : '';
    $('[data-k="tr-bar"]').style.width = (all.length ? ent / all.length * 100 : 0) + '%';

    var sel = $('#tn-f-cli');
    sel.innerHTML = '<option value="">Todos os clientes</option>' + state.clientes.slice().sort(byNome)
      .map(function (c) { return '<option value="' + esc(c.id) + '"' + (state.filtroCliente === c.id ? ' selected' : '') + '>' + esc(c.nome) + '</option>'; }).join('');

    var list = $('#tn-tr-list');
    var rows = all.filter(function (t) {
      return (!state.filtroEstado || t.estado === state.filtroEstado) && (!state.filtroCliente || t.cliente === state.filtroCliente);
    }).sort(function (a, b) {
      var ea = a.estado === 'entregue', eb = b.estado === 'entregue';
      if (ea !== eb) return ea ? 1 : -1;
      return (a.prazo || '9999').localeCompare(b.prazo || '9999');
    });
    if (!state.clientes.length) {
      list.innerHTML = '<div class="tn-empty"><b>Primeiro adiciona um cliente</b><span>Cada trabalho fica associado a um cliente.</span></div>';
      return;
    }
    if (!rows.length) {
      list.innerHTML = '<div class="tn-empty"><b>' + (all.length ? 'Nada com este filtro' : 'Ainda sem trabalhos') + '</b><span>' + (all.length ? 'Muda o filtro para ver outros trabalhos.' : 'Cria um trabalho e vai atualizando o estado.') + '</span></div>';
      return;
    }
    var h = hoje();
    list.innerHTML = rows.map(function (t) {
      var atrasado = t.prazo && t.prazo < h && t.estado !== 'entregue';
      return '<div class="tn-row tn-tr st-' + t.estado + '">' +
        '<span class="tn-tr-bar"></span>' +
        '<span class="tn-row-t"><b>' + esc(t.titulo) + '</b><small>' + esc(nomeCliente(t.cliente)) + '</small></span>' +
        '<span class="tn-prazo' + (atrasado ? ' late' : '') + '">' + (t.prazo ? (atrasado ? 'Atrasado · ' : 'Prazo ') + fmtData(t.prazo) : 'Sem prazo') + '</span>' +
        '<label class="tn-st st-' + t.estado + '"><span class="dot"></span><select data-act="estado" data-id="' + esc(t.id) + '" aria-label="Estado de ' + esc(t.titulo) + '">' +
          ESTADOS.map(function (e) { return '<option value="' + e.id + '"' + (e.id === t.estado ? ' selected' : '') + '>' + e.nome + '</option>'; }).join('') +
        '</select><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></label>' +
        '<span class="tn-row-a">' +
          '<button type="button" class="tn-icon-btn sm" data-act="edit-tr" data-id="' + esc(t.id) + '" aria-label="Editar" title="Editar">' + ICON.edit + '</button>' +
          '<button type="button" class="tn-icon-btn sm" data-act="del-tr" data-id="' + esc(t.id) + '" aria-label="Apagar" title="Apagar">' + ICON.del + '</button>' +
        '</span></div>';
    }).join('');
  }
  function render() { renderPlanos(); renderClientes(); renderTrabalhos(); }

  /* ---------- janela (adicionar / editar / confirmar) ---------- */
  var dlg, onSubmit, onCancel;
  function field(f, v) {
    var val = v == null ? '' : v;
    var inner;
    if (f.type === 'select') {
      inner = '<select name="' + f.name + '"' + (f.required ? ' required' : '') + '>' + f.options.map(function (o) {
        var ov = typeof o === 'object' ? o.v : o, ot = typeof o === 'object' ? o.t : o;
        return '<option value="' + esc(ov) + '"' + (String(ov) === String(val) ? ' selected' : '') + '>' + esc(ot) + '</option>';
      }).join('') + '</select>';
    } else {
      inner = '<input name="' + f.name + '" type="' + (f.type || 'text') + '" value="' + esc(val) + '"' + (f.required ? ' required' : '') + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + ' maxlength="160">';
    }
    return '<label class="tn-f' + (f.half ? ' half' : '') + '"><span>' + esc(f.label) + (f.required ? '' : ' <em>(opcional)</em>') + '</span>' + inner + '</label>';
  }
  function openDialog(title, fields, values, submitTxt, cb, danger) {
    onSubmit = cb; onCancel = null;
    $('#tn-dlg-t').textContent = title;
    $('#tn-dlg-body').innerHTML = fields.map(function (f) { return typeof f === 'string' ? '<p class="tn-dlg-p">' + f + '</p>' : field(f, values[f.name]); }).join('');
    var ok = $('#tn-dlg-ok');
    ok.textContent = submitTxt; ok.classList.toggle('danger', !!danger);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    var first = $('#tn-dlg-body input, #tn-dlg-body select'); if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function closeDialog(cancelled) {
    if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
    if (cancelled && onCancel) onCancel();
    onCancel = null;
  }

  var cliFields = function () {
    return [
      { name: 'nome', label: 'Nome', required: true, placeholder: 'Nome do atleta, treinador ou clube' },
      { name: 'clube', label: 'Clube / modalidade', half: true },
      { name: 'plano', label: 'Plano', type: 'select', options: [{ v: '', t: 'Sem plano' }].concat(planos), half: true },
      { name: 'whatsapp', label: 'Telemóvel (WhatsApp)', type: 'tel', placeholder: '9xx xxx xxx', half: true },
      { name: 'contacto', label: 'Email ou @instagram', half: true },
      { name: 'desde', label: 'Cliente desde', type: 'date', half: true }
    ];
  };
  var trFields = function () {
    return [
      { name: 'titulo', label: 'Trabalho', required: true, placeholder: 'Ex.: Pre match jornada 5' },
      { name: 'cliente', label: 'Cliente', type: 'select', required: true, options: state.clientes.slice().sort(byNome).map(function (c) { return { v: c.id, t: c.nome }; }) },
      { name: 'estado', label: 'Estado', type: 'select', required: true, options: ESTADOS.map(function (e) { return { v: e.id, t: e.nome }; }), half: true },
      { name: 'prazo', label: 'Prazo', type: 'date', half: true }
    ];
  };

  function addCliente() {
    openDialog('Novo cliente', cliFields(), { desde: hoje() }, 'Adicionar cliente', function (v) {
      v.id = uid(); state.clientes.push(v); render(); persist();
    });
  }
  function editCliente(id) {
    var c = find(state.clientes, id); if (!c) return;
    var a = ativaDe(c.id);
    openDialog('Editar cliente', cliFields(), Object.assign({}, c, { plano: planoDoCliente(c) }), 'Guardar', function (v) {
      Object.assign(c, v);
      if (a && v.plano && v.plano !== a.plano) { hist(a, 'plano', 'Plano alterado de ' + a.plano + ' para ' + v.plano); a.plano = v.plano; }
      render(); persist();
    });
  }
  function delCliente(id) {
    var c = find(state.clientes, id); if (!c) return;
    var n = state.trabalhos.filter(function (t) { return t.cliente === id; }).length;
    var np = state.assinaturas.filter(function (a) { return a.cliente === id; }).length;
    var extra = [n ? n + (n === 1 ? ' trabalho' : ' trabalhos') : '', np ? 'o histórico de planos' : ''].filter(Boolean).join(' e ');
    openDialog('Apagar cliente?', ['<b>' + esc(c.nome) + '</b> vai ser removido' + (extra ? ', juntamente com ' + extra + '.' : '.') + ' Isto não pode ser desfeito.'], {}, 'Apagar', function () {
      state.clientes = state.clientes.filter(function (x) { return x.id !== id; });
      state.trabalhos = state.trabalhos.filter(function (t) { return t.cliente !== id; });
      state.assinaturas = state.assinaturas.filter(function (a) { return a.cliente !== id; });
      if (state.filtroCliente === id) state.filtroCliente = '';
      render(); persist();
    }, true);
  }
  function addTrabalho() {
    if (!state.clientes.length) { addCliente(); return; }
    openDialog('Novo trabalho', trFields(), { cliente: state.filtroCliente || '', estado: 'por-comecar' }, 'Adicionar trabalho', function (v) {
      v.id = uid(); state.trabalhos.push(v); render(); persist();
    });
  }
  function editTrabalho(id) {
    var t = find(state.trabalhos, id); if (!t) return;
    openDialog('Editar trabalho', trFields(), t, 'Guardar', function (v) { Object.assign(t, v); render(); persist(); });
  }
  function delTrabalho(id) {
    var t = find(state.trabalhos, id); if (!t) return;
    openDialog('Apagar trabalho?', ['<b>' + esc(t.titulo) + '</b> (' + esc(nomeCliente(t.cliente)) + ') vai ser removido.'], {}, 'Apagar', function () {
      state.trabalhos = state.trabalhos.filter(function (x) { return x.id !== id; }); render(); persist();
    }, true);
  }

  /* ---------- eventos ---------- */
  function bind() {
    dlg = $('#tn-dlg');
    $('#tn-dlg-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = {};
      $$('#tn-dlg-body [name]').forEach(function (el) { v[el.name] = el.value.trim(); });
      var cb = onSubmit; onCancel = null; closeDialog(); if (cb) cb(v);
    });
    $('#tn-dlg-cancel').addEventListener('click', function () { closeDialog(true); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDialog(true); });
    dlg.addEventListener('cancel', function () { if (onCancel) { onCancel(); onCancel = null; } });

    $('#tn-cli-add').addEventListener('click', addCliente);
    $('#tn-tr-add').addEventListener('click', addTrabalho);
    if ($('#tn-ped-hist')) $('#tn-ped-hist').addEventListener('click', function () { state.histPed = !state.histPed; renderPlanos(); });
    $('#tn-ren-add').addEventListener('click', ativarPlano);
    $('#tn-ren-hist').addEventListener('click', function () { state.histRen = !state.histRen; renderPlanos(); });
    $('#tn-f-cli').addEventListener('change', function (e) { state.filtroCliente = e.target.value; renderTrabalhos(); });
    $('#tn-est-pills').addEventListener('click', function (e) {
      var b = e.target.closest('[data-est]'); if (!b) return;
      state.filtroEstado = b.getAttribute('data-est'); renderTrabalhos();
    });
    $('#tn-dash').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT') return;
      var id = b.getAttribute('data-id'), a = b.getAttribute('data-act');
      if (a === 'edit-cli') editCliente(id);
      else if (a === 'del-cli') delCliente(id);
      else if (a === 'edit-tr') editTrabalho(id);
      else if (a === 'del-tr') delTrabalho(id);
      else if (a === 'ped-aceitar') aceitarPedido(id);
      else if (a === 'ped-recusar') recusarPedido(id);
      else if (a === 'ren-enviada' || a === 'ren-desfazer') {
        var s = find(state.assinaturas, id); if (!s) return;
        if (a === 'ren-enviada') { s.mensagem = hoje(); hist(s, 'mensagem', 'Mensagem de renovação enviada'); }
        else { s.mensagem = ''; hist(s, 'mensagem-anulada', 'Registo de mensagem anulado'); }
        render(); persist();
      } else if (a === 'ver-cli') {
        state.filtroCliente = id; state.filtroEstado = ''; renderTrabalhos();
        $('#tn-trab').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    $('#tn-dash').addEventListener('change', function (e) {
      var act = e.target.getAttribute('data-act'), id = e.target.getAttribute('data-id');
      if (act === 'estado') {
        var t = find(state.trabalhos, id);
        if (t) { t.estado = e.target.value; render(); persist(); }
      } else if (act === 'ren-resposta') responder(id, e.target.value, e.target);
    });
  }

  /* ---------- arranque e atualização automática ---------- */
  var started = false, pollTimer;
  function refresh() {
    if (saving || inFlight || (dlg && dlg.open) || !document.body.classList.contains('tn-on-dash') || document.hidden) { render(); return; }
    backend.load().then(function (d) {
      if (saving || inFlight || dlg.open) return;
      if (Number(d.rev) === state.rev) state.pedidos = mergePedidos(d.pedidos || []);
      else if (!Object.keys(decisoes).length) aplicar(d);
      if (sincronizar()) persist();
      render();
    }).catch(function () { render(); });
  }
  function start() {
    if (started) { refresh(); return; }
    started = true;
    status('A carregar…', 'busy');
    backend.planos().then(function (p) { if (p && p.length) planos = p; }).catch(function () {});
    backend.load().then(function (d) {
      aplicar(d);
      var mudou = sincronizar();
      render(); status(d.atualizado ? 'Tudo guardado' : 'Pronto', 'ok');
      if (mudou) persist();
    }).catch(function () {
      render(); status('Não foi possível carregar os dados', 'err');
    });
    pollTimer = setInterval(refresh, 60000); // novos pedidos + mudança de dia (hora de Portugal)
  }
  window.addEventListener('beforeunload', function (e) { if (saving) { e.preventDefault(); e.returnValue = ''; } });

  bind();
  window.TNDash = {
    start: start,
    confirm: function (title, html, okTxt, cb, danger) { openDialog(title, [html], {}, okTxt, cb, danger !== false); },
    esc: esc
  };
})();
