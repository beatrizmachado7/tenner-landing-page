/* TENNER. — páginas Planos (#/planos), Arquivo (#/arquivo), O que fazemos (#/servicos) e Serviços extra (#/extras)
   Lê os ficheiros do site (content/planos/*.json e content/galeria/*.json) pelo Git Gateway
   e junta todas as alterações num único commit quando carregas em «Publicar no site»
   (uma publicação no Netlify, em vez de uma por cada alteração). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var G = function () { return window.TNGit; };
  var ICON = {
    edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    del: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>'
  };

  var st = {
    planos: [],        // [{ ficheiro, data }]
    arquivo: null,     // { estatico, motion, social }
    sujos: {},         // caminho → true (JSON a regravar)
    media: [],         // [{ caminho, ficheiro }]
    urls: {},          // caminho do site → URL local (ficheiros ainda por publicar)
    cols: {},          // servicos / extras: [{ ficheiro, data }]
    site: null,        // content/site.json (página inicial)
    secs: null,        // content/seccoes/*.json (secções criadas no painel)
    apagar: {},        // caminho → true (ficheiros a apagar)
    carregado: { planos: false, arquivo: false, servicos: false, extras: false, inicio: false, seccoes: false },
    publicando: false
  };
  var SEC = {
    estatico: { ficheiro: 'content/galeria/estatico.json', nome: 'Pré Match Estático', campo: 'image', tipo: 'foto', titulo: 'Pre Match Estático' },
    motion: { ficheiro: 'content/galeria/motion.json', nome: 'Motion Vídeos', campo: 'video', tipo: 'video', titulo: 'Pre Match Motion Videos' },
    social: { ficheiro: 'content/galeria/carrosseis.json', nome: 'Social Media', campo: 'images', tipo: 'carrossel', titulo: 'Conteúdos Social Media' }
  };

  /* ---------- utilitários ---------- */
  var src = function (caminho) { return st.urls[caminho] || caminho; };
  function nPendentes() { return Object.keys(st.sujos).length + st.media.length + Object.keys(st.apagar).length; }
  function barra() {
    var n = nPendentes(), b = $('#tn-pub');
    b.hidden = !n && !st.publicando;
    $('#tn-pub-n').textContent = n === 1 ? '1 alteração por publicar' : n + ' alterações por publicar';
  }
  function status(txt, cls) {
    $$('.tn-cont-st').forEach(function (el) { el.textContent = txt; el.className = 'tn-save tn-cont-st ' + (cls || ''); });
  }
  function marcar(caminho) { st.sujos[caminho] = true; barra(); }
  function nomeFicheiro(nome, file) {
    var ext = (file.name.match(/\.[a-z0-9]+$/i) || ['.' + (file.type.split('/')[1] || 'bin')])[0].toLowerCase();
    return 'images/uploads/' + G().slug(nome) + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + ext;
  }
  // reduz fotos muito grandes (mantém o formato original da imagem, sem cortes)
  function prepararFoto(file) {
    return new Promise(function (res) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5e6) return res(file);
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 2200, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { URL.revokeObjectURL(url); res(b && b.size < file.size ? new File([b], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { res(file); };
      img.src = url;
    });
  }
  function juntarMedia(file, nome) {
    var caminho = nomeFicheiro(nome, file);
    st.media.push({ caminho: caminho, ficheiro: file });
    var publico = '/' + caminho;
    st.urls[publico] = URL.createObjectURL(file);
    return publico;
  }

  /* ---------- descrição do plano ⇄ pontos do site ---------- */
  // cada linha = um ponto; «texto — detalhe»; «OFERTA …» destaca uma oferta
  function pontosParaTexto(features) {
    return (features || []).map(function (f) {
      var l = f.text || '';
      if (f.offer) l += (l ? ' + ' : '') + 'OFERTA ' + f.offer;
      if (f.detail) l += ' — ' + f.detail;
      return l;
    }).join('\n');
  }
  function textoParaPontos(txt) {
    return String(txt || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var detail = '', offer = '', text = l;
      var i = text.indexOf(' — '); if (i > -1) { detail = text.slice(i + 3).trim(); text = text.slice(0, i).trim(); }
      var m = text.match(/^(.*?)(?:\s*\+\s*)?OFERTA\s+(.+)$/);
      if (m) { text = m[1].trim(); offer = m[2].trim(); }
      return { text: text, offer: offer, detail: detail };
    });
  }
  // bloco «Versão em inglês»: abre-se sozinho quando já tem texto
  function abrirEN(f, temTexto) { var d = f.querySelector('.tn-en'); if (d) d.open = !!String(temTexto || '').trim(); }
  var nomeCompleto = function (d) { return (d.name + (d.suffix ? ' ' + d.suffix : '')).trim(); };

  /* ---------- PLANOS ---------- */
  function carregarPlanos() {
    status('A carregar…', 'busy');
    return G().listar('content/planos').then(function (fs) {
      fs = fs.filter(function (f) { return /\.json$/.test(f); }).sort();
      return Promise.all(fs.map(function (f) { return G().lerJSON('content/planos/' + f).then(function (d) { return { ficheiro: f, data: d }; }); }));
    }).then(function (lista) {
      st.planos = lista.sort(function (a, b) { return (Number(a.data.ordem) || 0) - (Number(b.data.ordem) || 0); });
      st.carregado.planos = true; renderPlanos(); status('Atualizado', 'ok');
    }).catch(function (e) {
      $('#tn-planos-grid').innerHTML = '<div class="tn-empty"><b>Não foi possível carregar os planos</b><span>' + esc(e.message) + '</span></div>';
      status('Erro ao carregar', 'err');
    });
  }
  function renderPlanos() {
    var g = $('#tn-planos-grid');
    if (!st.planos.length) { g.innerHTML = '<div class="tn-empty"><b>Sem planos</b></div>'; return; }
    g.innerHTML = st.planos.map(function (p, i) {
      var d = p.data, pontos = (d.features || []).length, visivel = d.visivel !== false;
      var sujo = st.sujos['content/planos/' + p.ficheiro];
      return '<button type="button" class="tn-pc' + (d.featured ? ' top' : '') + (visivel ? '' : ' off') + '" data-plano="' + i + '">' +
        '<span class="tn-pc-logo">' + (d.featured ? '<span class="tn-pc-badge">Mais pedido</span>' : '') +
          '<b>' + esc(d.name) + (d.suffix ? '<i>' + esc(d.suffix) + '</i>' : '') + '</b></span>' +
        '<span class="tn-pc-rows">' +
          '<span class="tn-pc-row"><i></i>Mais pedido<b class="' + (d.featured ? 'y' : '') + '">' + (d.featured ? 'Sim' : 'Não') + '</b></span>' +
          '<span class="tn-pc-row"><i></i>No site<b class="' + (visivel ? 'g' : 'r') + '">' + (visivel ? 'Visível' : 'Escondido') + '</b></span>' +
          '<span class="tn-pc-row"><i></i>WhatsApp<b>' + (d.whatsapp_message ? 'Mensagem definida' : 'Sem mensagem') + '</b></span>' +
          '<span class="tn-pc-row"><i></i>Descrição<b>' + pontos + (pontos === 1 ? ' ponto' : ' pontos') + '</b></span>' +
        '</span>' +
        '<span class="tn-pc-foot">' + (sujo ? '<em>Por publicar</em>' : 'Editar plano') + ICON.arrow + '</span>' +
      '</button>';
    }).join('');
  }
  var planoAtual = null;
  function abrirPlano(i) {
    var p = st.planos[i]; if (!p) return; planoAtual = i;
    var d = p.data, f = $('#tn-pl-form');
    $('#tn-pl-t').textContent = 'Editar ' + nomeCompleto(d);
    f.nome.value = nomeCompleto(d);
    f.descricao.value = pontosParaTexto(d.features);
    f.featured.checked = !!d.featured;
    f.whatsapp.value = d.whatsapp_message || '';
    f.descricao_en.value = pontosParaTexto(d.features_en);
    f.whatsapp_en.value = d.whatsapp_message_en || '';
    abrirEN(f, f.descricao_en.value || f.whatsapp_en.value);
    f.visivel.checked = d.visivel !== false;
    $('#tn-pl-msg').textContent = '';
    abrir($('#tn-pl-dlg'));
    setTimeout(function () { f.nome.focus(); }, 30);
  }
  function guardarPlano(e) {
    e.preventDefault();
    var p = st.planos[planoAtual], f = e.target; if (!p) return;
    var nome = f.nome.value.trim().replace(/\s+/g, ' ');
    if (!nome) { $('#tn-pl-msg').textContent = 'Escreve o nome do plano.'; f.nome.focus(); return; }
    var partes = nome.split(' ');
    p.data.name = partes.shift();
    p.data.suffix = partes.join(' ');
    p.data.features = textoParaPontos(f.descricao.value);
    p.data.featured = f.featured.checked;
    p.data.whatsapp_message = f.whatsapp.value.trim();
    p.data.features_en = textoParaPontos(f.descricao_en.value);
    p.data.whatsapp_message_en = f.whatsapp_en.value.trim();
    p.data.visivel = f.visivel.checked;
    marcar('content/planos/' + p.ficheiro);
    fechar($('#tn-pl-dlg')); renderPlanos();
    status('Guardado — falta publicar no site', 'busy');
  }

  /* ---------- ARQUIVO ---------- */
  function carregarArquivo() {
    status('A carregar…', 'busy');
    var chaves = Object.keys(SEC);
    return Promise.all(chaves.map(function (k) {
      return G().lerJSON(SEC[k].ficheiro).catch(function () { return { title: SEC[k].titulo, items: [] }; });
    })).then(function (r) {
      st.arquivo = {};
      chaves.forEach(function (k, i) {
        var d = r[i] || {}; d.items = Array.isArray(d.items) ? d.items : [];
        if (k === 'social') d.items = d.items.map(function (c) { return { title: c.title || '', images: (c.images || []).map(function (x) { return x && typeof x === 'object' ? x.image : x; }).filter(Boolean) }; });
        st.arquivo[k] = d;
      });
      st.carregado.arquivo = true; renderArquivo(); status('Atualizado', 'ok');
    }).catch(function (e) {
      $('#tn-arq-wrap').innerHTML = '<div class="tn-empty"><b>Não foi possível carregar o Arquivo</b><span>' + esc(e.message) + '</span></div>';
      status('Erro ao carregar', 'err');
    });
  }
  function tile(k, it, i) {
    var s = SEC[k], nome = it.title || '', media;
    if (s.tipo === 'foto') media = it.image ? '<img src="' + esc(src(it.image)) + '" alt="' + esc(nome) + '" loading="lazy">' : '<span class="tn-ph">Sem foto</span>';
    else if (s.tipo === 'video') media = it.video ? '<video src="' + esc(src(it.video)) + '#t=0.5" muted playsinline preload="metadata"></video><span class="tn-play">' + ICON.play + '</span>' : '<span class="tn-ph">Sem vídeo</span>';
    else {
      var imgs = it.images || [];
      media = imgs.length ? '<div class="tn-car" data-i="0" data-n="' + imgs.length + '"><div class="tn-car-track">' +
        imgs.map(function (x, j) { return '<img src="' + esc(src(x)) + '" alt="' + esc(nome + ' — foto ' + (j + 1)) + '" loading="lazy">'; }).join('') + '</div>' +
        (imgs.length > 1 ? '<button type="button" class="tn-car-b prev" data-car="-1" aria-label="Foto anterior" hidden>' + ICON.prev + '</button>' +
          '<button type="button" class="tn-car-b next" data-car="1" aria-label="Foto seguinte">' + ICON.next + '</button>' +
          '<span class="tn-car-n">1/' + imgs.length + '</span><span class="tn-car-dots">' + imgs.map(function (_, j) { return '<i' + (j ? '' : ' class="on"') + '></i>'; }).join('') + '</span>' : '') +
        '</div>' : '<span class="tn-ph">Sem fotos</span>';
    }
    return '<figure class="tn-tile">' +
      '<div class="tn-tile-m">' + media + '</div>' +
      '<figcaption><b>' + esc(nome || 'Sem nome') + '</b>' +
        '<span class="tn-tile-a">' +
          '<button type="button" class="tn-icon-btn sm" data-pub="' + k + ':' + i + '" data-a="edit" aria-label="Editar publicação" title="Editar">' + ICON.edit + '</button>' +
          '<button type="button" class="tn-icon-btn sm" data-pub="' + k + ':' + i + '" data-a="del" aria-label="Apagar publicação" title="Apagar">' + ICON.del + '</button>' +
        '</span></figcaption></figure>';
  }
  function renderArquivo() {
    if (!st.arquivo) return;
    $('#tn-arq-wrap').innerHTML = Object.keys(SEC).map(function (k) {
      var s = SEC[k], d = st.arquivo[k], n = d.items.length, sujo = st.sujos[s.ficheiro];
      return '<section class="tn-card tn-panel tn-arq-sec" aria-label="' + esc(s.nome) + '">' +
        '<div class="tn-card-h"><span class="tn-card-t"><span class="tn-chip">' + (s.tipo === 'video'
          ? '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="15" height="14" rx="2"/><path d="M17 10l5-3v10l-5-3"/></svg>'
          : s.tipo === 'carrossel' ? '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M3 7v10M21 7v10"/></svg>'
          : '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>') +
          '</span>' + esc(s.nome) + ' <em>' + n + '</em>' + (sujo ? '<span class="tn-pend">Por publicar</span>' : '') + '</span>' +
          '<button type="button" class="tn-btn" data-nova="' + k + '">' + ICON.plus + 'Nova publicação</button></div>' +
        (n ? '<div class="tn-tiles' + (s.tipo === 'carrossel' ? ' car' : '') + '">' + d.items.map(function (it, i) { return tile(k, it, i); }).join('') + '</div>'
           : '<div class="tn-empty sm"><b>Sem publicações</b><span>Carrega em «Nova publicação» para adicionar.</span></div>') +
      '</section>';
    }).join('');
  }
  function moverCarrossel(car, dir) {
    var n = +car.getAttribute('data-n'), i = Math.max(0, Math.min(n - 1, +car.getAttribute('data-i') + dir));
    car.setAttribute('data-i', i);
    $('.tn-car-track', car).style.transform = 'translateX(' + (-100 * i) + '%)';
    $('.tn-car-n', car).textContent = (i + 1) + '/' + n;
    $('.prev', car).hidden = i === 0; $('.next', car).hidden = i === n - 1;
    $$('.tn-car-dots i', car).forEach(function (d, j) { d.classList.toggle('on', j === i); });
  }

  // janela «Nova publicação» / «Editar publicação»
  var pub = null; // { k, i (ou -1), ficheiros: [{ file|null, caminho|null, url }] }
  function abrirPub(k, i) {
    var s = SEC[k], it = i > -1 ? st.arquivo[k].items[i] : null;
    pub = { k: k, i: i, ficheiros: [] };
    if (it) {
      var lista = s.tipo === 'carrossel' ? it.images : [it[s.campo]];
      pub.ficheiros = lista.filter(Boolean).map(function (c) { return { file: null, caminho: c, url: src(c) }; });
    }
    var f = $('#tn-pub-form');
    f.nome.value = it ? it.title : '';
    $('#tn-pub-t').textContent = (it ? 'Editar publicação · ' : 'Nova publicação · ') + s.nome;
    var inp = f.ficheiro;
    inp.accept = s.tipo === 'video' ? 'video/*' : 'image/*';
    inp.multiple = s.tipo === 'carrossel';
    $('#tn-pub-up-t').textContent = s.tipo === 'video' ? 'Adicionar vídeo' : s.tipo === 'carrossel' ? 'Adicionar fotos' : 'Adicionar foto';
    $('#tn-pub-hint').textContent = s.tipo === 'video' ? 'MP4 ou MOV, até 40 MB.' : s.tipo === 'carrossel'
      ? 'Podes escolher várias fotos. Aparecem no site pela ordem em que estão aqui, em carrossel.' : 'JPG ou PNG. A foto aparece inteira, sem cortes.';
    $('#tn-pub-msg').textContent = '';
    renderPubFicheiros();
    abrir($('#tn-pub-dlg'));
    setTimeout(function () { f.nome.focus(); }, 30);
  }
  function renderPubFicheiros() {
    var s = SEC[pub.k], box = $('#tn-pub-files');
    box.innerHTML = pub.ficheiros.map(function (x, j) {
      var m = s.tipo === 'video' ? '<video src="' + esc(x.url) + '#t=0.5" muted playsinline preload="metadata"></video>' : '<img src="' + esc(x.url) + '" alt="">';
      return '<span class="tn-thumb">' + m + (s.tipo === 'carrossel' ? '<em>' + (j + 1) + '</em>' : '') +
        '<button type="button" data-rm="' + j + '" aria-label="Remover">' + ICON.x + '</button></span>';
    }).join('');
    box.hidden = !pub.ficheiros.length;
  }
  function escolherFicheiros(e) {
    var s = SEC[pub.k], files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    var maxMB = s.tipo === 'video' ? 40 : 15;
    var grandes = files.filter(function (f) { return f.size > maxMB * 1e6; });
    if (grandes.length) { $('#tn-pub-msg').textContent = 'O ficheiro «' + grandes[0].name + '» tem mais de ' + maxMB + ' MB. Usa uma versão mais leve.'; return; }
    Promise.all(files.map(function (f) { return s.tipo === 'video' ? f : prepararFoto(f); })).then(function (prontos) {
      var novos = prontos.map(function (f) { return { file: f, caminho: null, url: URL.createObjectURL(f) }; });
      pub.ficheiros = s.tipo === 'carrossel' ? pub.ficheiros.concat(novos) : novos.slice(0, 1);
      $('#tn-pub-msg').textContent = '';
      renderPubFicheiros();
    });
  }
  function guardarPub(e) {
    e.preventDefault();
    var s = SEC[pub.k], f = e.target, nome = f.nome.value.trim();
    if (!nome) { $('#tn-pub-msg').textContent = 'Escreve o nome da publicação.'; f.nome.focus(); return; }
    if (!pub.ficheiros.length) { $('#tn-pub-msg').textContent = s.tipo === 'video' ? 'Adiciona o vídeo.' : 'Adiciona pelo menos uma foto.'; return; }
    var caminhos = pub.ficheiros.map(function (x) {
      if (x.caminho) return x.caminho;
      var c = juntarMedia(x.file, nome); URL.revokeObjectURL(x.url); return c;
    });
    var item = s.tipo === 'carrossel' ? { title: nome, images: caminhos } : (function () { var o = { title: nome }; o[s.campo] = caminhos[0]; return o; })();
    var items = st.arquivo[pub.k].items;
    if (pub.i > -1) items[pub.i] = item; else items.unshift(item);
    marcar(s.ficheiro);
    fechar($('#tn-pub-dlg')); renderArquivo();
    status('Guardado — falta publicar no site', 'busy');
  }
  function apagarPub(k, i) {
    var it = st.arquivo[k].items[i]; if (!it) return;
    window.TNDash.confirm('Apagar publicação?', '<b>' + esc(it.title || 'Sem nome') + '</b> sai do Arquivo do site quando publicares as alterações.', 'Apagar', function () {
      st.arquivo[k].items.splice(i, 1); marcar(SEC[k].ficheiro); renderArquivo();
    });
  }

  /* ---------- O QUE FAZEMOS / SERVIÇOS EXTRA ---------- */
  var COL = {
    servicos: { pasta: 'content/servicos', nome: 'serviço', grid: '#tn-sv-grid-servicos' },
    extras: { pasta: 'content/extras', nome: 'serviço extra', grid: '#tn-sv-grid-extras' }
  };
  // extras: 1.ª linha da descrição = frase curta (sempre visível no site); resto = texto que aparece ao abrir
  function descDe(k, d, sfx) {
    sfx = sfx || '';
    if (sfx) d = { subtitle: d['subtitle' + sfx], text: d['text' + sfx] };
    return k === 'extras' ? [d.subtitle || '', d.text || ''].filter(function (x, i) { return x || i === 0; }).join('\n').replace(/\n$/, '') : (d.text || ''); }
  function aplicarDesc(k, d, txt, sfx) {
    sfx = sfx || '';
    txt = String(txt || '').replace(/\r/g, '').trim();
    if (k === 'extras') { var i = txt.indexOf('\n'); d['subtitle' + sfx] = (i < 0 ? txt : txt.slice(0, i)).trim(); d['text' + sfx] = i < 0 ? '' : txt.slice(i + 1).trim(); }
    else d['text' + sfx] = txt;
  }
  function carregarCol(k) {
    status('A carregar…', 'busy');
    return G().listar(COL[k].pasta).then(function (fs) {
      fs = fs.filter(function (f) { return /\.json$/.test(f); }).sort();
      return Promise.all(fs.map(function (f) { return G().lerJSON(COL[k].pasta + '/' + f).then(function (d) { return { ficheiro: f, data: d }; }); }));
    }).then(function (lista) {
      st.cols[k] = lista.sort(function (a, b) { return (Number(a.data.ordem) || 0) - (Number(b.data.ordem) || 0); });
      st.carregado[k] = true; renderCol(k); status('Atualizado', 'ok');
    }).catch(function (e) {
      $(COL[k].grid).innerHTML = '<div class="tn-empty"><b>Não foi possível carregar</b><span>' + esc(e.message) + '</span></div>';
      status('Erro ao carregar', 'err');
    });
  }
  function renderCol(k) {
    var lista = st.cols[k] || [], g = $(COL[k].grid);
    g.innerHTML = lista.map(function (it, i) {
      var d = it.data, visivel = d.visivel !== false, desc = descDe(k, d).replace(/\n/g, ' · ');
      var sujo = st.sujos[COL[k].pasta + '/' + it.ficheiro];
      return '<button type="button" class="tn-pc tn-sv' + (visivel ? '' : ' off') + '" data-col="' + k + ':' + i + '">' +
        '<span class="tn-pc-logo sm"><b>' + esc(d.title || 'Sem nome') + '</b></span>' +
        '<span class="tn-pc-desc">' + (desc ? esc(desc) : '<em>Sem descrição</em>') + '</span>' +
        '<span class="tn-pc-rows"><span class="tn-pc-row"><i></i>No site<b class="' + (visivel ? 'g' : 'r') + '">' + (visivel ? 'Visível' : 'Escondido') + '</b></span></span>' +
        '<span class="tn-pc-foot">' + (sujo ? '<em>Por publicar</em>' : 'Editar') + ICON.arrow + '</span>' +
      '</button>';
    }).join('') + '<button type="button" class="tn-pc tn-pc-new" data-col-novo="' + k + '"><span>' + ICON.plus + '</span>Novo ' + COL[k].nome + '</button>';
  }
  var colAtual = null; // { k, i (-1 = novo) }
  function abrirCol(k, i) {
    var it = i > -1 ? st.cols[k][i] : null, d = it ? it.data : { title: '', visivel: true };
    colAtual = { k: k, i: i };
    var f = $('#tn-sv-form');
    $('#tn-sv-t').textContent = it ? 'Editar ' + (d.title || COL[k].nome) : 'Novo ' + COL[k].nome;
    f.nome.value = d.title || '';
    f.descricao.value = descDe(k, d);
    f.nome_en.value = d.title_en || '';
    f.descricao_en.value = descDe(k, d, '_en');
    abrirEN(f, f.nome_en.value + f.descricao_en.value);
    f.visivel.checked = d.visivel !== false;
    $('#tn-sv-help').textContent = k === 'extras'
      ? 'A primeira linha é a frase curta que aparece sempre no site. As linhas seguintes aparecem quando a pessoa abre o serviço.'
      : 'O texto que aparece por baixo do nome no site.';
    $('#tn-sv-del').hidden = !it;
    $('#tn-sv-msg').textContent = '';
    abrir($('#tn-sv-dlg'));
    setTimeout(function () { f.nome.focus(); }, 30);
  }
  function guardarCol(e) {
    e.preventDefault();
    var f = e.target, k = colAtual.k, nome = f.nome.value.trim();
    if (!nome) { $('#tn-sv-msg').textContent = 'Escreve o nome.'; f.nome.focus(); return; }
    var lista = st.cols[k], it;
    if (colAtual.i > -1) it = lista[colAtual.i];
    else {
      var ordem = lista.reduce(function (m, x) { return Math.max(m, Number(x.data.ordem) || 0); }, 0) + 10;
      var n = String(lista.length + 1).padStart(2, '0');
      it = { ficheiro: n + '-' + G().slug(nome) + '-' + Date.now().toString(36).slice(-4) + '.json', data: k === 'extras' ? { title: '', subtitle: '', text: '', highlight: false, ordem: ordem, visivel: true } : { title: '', text: '', ordem: ordem, visivel: true } };
      lista.push(it);
    }
    it.data.title = nome;
    aplicarDesc(k, it.data, f.descricao.value);
    it.data.title_en = f.nome_en.value.trim();
    aplicarDesc(k, it.data, f.descricao_en.value, '_en');
    it.data.visivel = f.visivel.checked;
    marcar(COL[k].pasta + '/' + it.ficheiro);
    fechar($('#tn-sv-dlg')); renderCol(k);
    status('Guardado — falta publicar no site', 'busy');
  }
  function apagarCol() {
    var k = colAtual.k, it = st.cols[k][colAtual.i]; if (!it) return;
    fechar($('#tn-sv-dlg'));
    window.TNDash.confirm('Apagar ' + COL[k].nome + '?', '<b>' + esc(it.data.title) + '</b> sai do site quando publicares as alterações.', 'Apagar', function () {
      var c = COL[k].pasta + '/' + it.ficheiro;
      st.cols[k].splice(colAtual.i, 1);
      delete st.sujos[c]; st.apagar[c] = true; barra(); renderCol(k);
    });
  }

  /* ---------- PÁGINA INICIAL (content/site.json) ---------- */
  var SITE_F = 'content/site.json';
  var BLOCOS = [
    { id: 'topo', titulo: 'Topo da página', desc: 'O que aparece logo ao abrir o site, com 3 imagens ou vídeos.', campos: [
      { k: 'hero.eyebrow', l: 'Frase de cima' },
      { k: 'hero.tagline', l: 'Slogan' },
      { k: 'hero.intro', l: 'Texto de apresentação', t: 'area' },
      { k: 'hero.image1', l: 'Imagem ou vídeo 1 (o maior, com moldura amarela)', t: 'img' },
      { k: 'hero.image2', l: 'Imagem ou vídeo 2 (vertical, à direita)', t: 'img' },
      { k: 'hero.image3', l: 'Imagem ou vídeo 3 (quadrado, em baixo)', t: 'img' }
    ] },
    { id: 'faixa', titulo: 'Fita a rodar', desc: 'A fita amarela que passa a rodar no site (Pre match, Match highlight…).', campos: [
      { k: 'marquee', l: 'Palavras da fita', t: 'linhas', help: 'Uma palavra ou expressão por linha, pela ordem em que passam.' }
    ] },
    { id: 'sobre', titulo: 'Sobre nós', desc: 'O título «Cada percurso tem uma história para contar», o texto e as etiquetas.', campos: [
      { k: 'about.title', l: 'Título' },
      { k: 'about.paragraph1', l: 'Texto — 1.º parágrafo', t: 'area' },
      { k: 'about.paragraph2', l: 'Texto — 2.º parágrafo', t: 'area' },
      { k: 'about.audience', l: 'Etiquetas', t: 'linhas', help: 'Uma por linha (Atletas, Treinadores, Clubes, Marcas, Empresas).' }
    ] },
    { id: 'textos', titulo: 'Textos das secções', desc: 'As frases de introdução de «Serviços» e «Serviços extra».', campos: [
      { k: 'servicos_intro', l: 'Introdução de «Serviços»', t: 'area' },
      { k: 'extras_intro', l: 'Introdução de «Serviços extra»', t: 'area' }
    ] },
    { id: 'contacto', titulo: 'Contacto e WhatsApp', desc: 'O fundo da página e o número de WhatsApp dos planos.', campos: [
      { k: 'contact.title', l: 'Título' },
      { k: 'contact.subtitle', l: 'Subtítulo' },
      { k: 'contact.email', l: 'Email', tipo: 'email', en: false },
      { k: 'contact.instagram', l: 'Instagram', help: 'Só o nome da conta, sem @.', en: false },
      { k: 'whatsapp.link', l: 'Número de WhatsApp', tipo: 'tel', en: false, help: 'Ex.: 912 345 678 (ou com indicativo, +351 912 345 678). É o número que abre quando carregam em «Quero o …» nos planos. Sem número, esses botões levam à secção de contacto.' }
    ] }
  ];
  var eVideo = function (v) { return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(String(v || '')) || /^data:video|^blob:.*#v$/.test(String(v || '')); };
  function mediaTag(v, id, extra) {
    if (!v) return '<img' + (id ? ' id="' + id + '"' : '') + ' alt="" hidden>';
    return eVideo(v) ? '<video' + (id ? ' id="' + id + '"' : '') + ' src="' + esc(src(v)) + '" muted loop autoplay playsinline' + (extra || '') + '></video>'
      : '<img' + (id ? ' id="' + id + '"' : '') + ' src="' + esc(src(v)) + '" alt=""' + (extra || '') + '>';
  }
  var getP = function (o, k) { return k.split('.').reduce(function (a, x) { return a == null ? undefined : a[x]; }, o); };
  var setP = function (o, k, v) { var ks = k.split('.'), last = ks.pop(); ks.forEach(function (x) { if (!o[x] || typeof o[x] !== 'object') o[x] = {}; o = o[x]; }); o[last] = v; };
  function carregarInicio() {
    status('A carregar…', 'busy');
    return G().lerJSON(SITE_F).then(function (d) { st.site = d; st.carregado.inicio = true; renderInicio(); status('Atualizado', 'ok'); })
      .catch(function (e) { $('#tn-in-grid').innerHTML = '<div class="tn-empty"><b>Não foi possível carregar</b><span>' + esc(e.message) + '</span></div>'; status('Erro ao carregar', 'err'); });
  }
  function resumo(v, t) {
    if (t === 'linhas') return (v || []).length + ((v || []).length === 1 ? ' item' : ' itens');
    var s = String(v || '').trim(); return s ? (s.length > 42 ? s.slice(0, 40) + '…' : s) : '—';
  }
  function renderInicio() {
    if (!st.site) return;
    var sujo = st.sujos[SITE_F];
    $('#tn-in-grid').innerHTML = BLOCOS.map(function (b, i) {
      var imgs = b.campos.filter(function (c) { return c.t === 'img'; });
      var rows = b.campos.filter(function (c) { return c.t !== 'img'; }).map(function (c) {
        return '<span class="tn-pc-row"><i></i>' + esc(c.l) + '<b>' + esc(resumo(getP(st.site, c.k), c.t)) + '</b></span>';
      }).join('');
      return '<button type="button" class="tn-pc tn-in" data-bloco="' + i + '">' +
        '<span class="tn-pc-logo sm"><b>' + esc(b.titulo) + '</b></span>' +
        (imgs.length ? '<span class="tn-in-imgs">' + imgs.map(function (c) { var v = getP(st.site, c.k); return v ? mediaTag(v) : '<span></span>'; }).join('') + '</span>' : '') +
        '<span class="tn-pc-desc sm">' + esc(b.desc) + '</span>' +
        '<span class="tn-pc-rows">' + rows + '</span>' +
        '<span class="tn-pc-foot">' + (sujo ? '<em>Por publicar</em>' : 'Editar') + ICON.arrow + '</span></button>';
    }).join('');
  }
  var blocoAtual = null, imgNovas = {};
  function campoInput(c, v, id) {
    var val = c.t === 'linhas' ? (v || []).join('\n') : (v || '');
    return c.t === 'area' || c.t === 'linhas'
      ? '<textarea id="' + id + '" data-k="' + esc(c.k) + '" data-t="' + (c.t || '') + '" rows="' + (c.t === 'linhas' ? 5 : 4) + '">' + esc(val) + '</textarea>'
      : '<input id="' + id + '" data-k="' + esc(c.k) + '" type="' + (c.tipo || 'text') + '" value="' + esc(val) + '" maxlength="300">';
  }
  function abrirBloco(i) {
    var b = BLOCOS[i]; blocoAtual = i; imgNovas = {};
    $('#tn-in-t').textContent = b.titulo;
    var trad = b.campos.filter(function (c) { return c.t !== 'img' && c.en !== false; });
    var temEN = trad.some(function (c) { var v = getP(st.site, 'en.' + c.k); return Array.isArray(v) ? v.length : String(v || '').trim(); });
    var blocoEN = trad.length ? '<details class="tn-en"' + (temEN ? ' open' : '') + '><summary><span class="tn-en-flag">EN</span><b>Versão em inglês</b><small>Opcional — o que aparece quando o site está em inglês. Se ficar vazio, mostra o português.</small></summary><div class="tn-en-b">' +
      trad.map(function (c, j) {
        var id = 'tn-in-e' + j, ce = Object.assign({}, c, { k: 'en.' + c.k });
        return '<label class="tn-f" for="' + id + '"><span>' + esc(c.l) + ' em inglês</span>' + campoInput(ce, getP(st.site, ce.k), id) + '</label>';
      }).join('') + '</div></details>' : '';
    $('#tn-in-body').innerHTML = b.campos.map(function (c, j) {
      var v = getP(st.site, c.k), id = 'tn-in-f' + j;
      if (c.t === 'img') return '<div class="tn-f"><span>' + esc(c.l) + '</span><div class="tn-in-img">' +
        '<span class="tn-in-prev" id="' + id + '-p">' + mediaTag(v) + '</span>' +
        '<span class="tn-in-imgb"><label class="tn-btn sm"><input type="file" accept="image/*,video/*" hidden data-img="' + esc(c.k) + '" data-prev="' + id + '-p">' + ICON.up + 'Trocar imagem ou vídeo</label>' +
        '<small class="tn-f-help">Foto (JPG, PNG) ou vídeo (MP4, até 40 MB). O vídeo passa em loop, sem som.</small></span></div></div>';
      return '<label class="tn-f" for="' + id + '"><span>' + esc(c.l) + '</span>' + campoInput(c, v, id) + (c.help ? '<small class="tn-f-help">' + esc(c.help) + '</small>' : '') + '</label>';
    }).join('') + blocoEN;
    abrir($('#tn-in-dlg'));
    var f = $('#tn-in-body input:not([type=file]), #tn-in-body textarea'); if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function guardarBloco(e) {
    e.preventDefault();
    $$('#tn-in-body [data-k]').forEach(function (el) {
      var v = el.value.trim();
      if (el.getAttribute('data-t') === 'linhas') v = v.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      if (el.getAttribute('data-k') === 'contact.instagram') v = v.replace(/^@/, '');
      setP(st.site, el.getAttribute('data-k'), v);
    });
    Object.keys(imgNovas).forEach(function (k) { setP(st.site, k, juntarMedia(imgNovas[k], 'inicio-' + k.split('.').pop())); });
    imgNovas = {};
    marcar(SITE_F); fechar($('#tn-in-dlg')); renderInicio();
    status('Guardado — falta publicar no site', 'busy');
  }

  /* ---------- NOVAS SECÇÕES (content/seccoes/*.json) ---------- */
  var SEC_P = 'content/seccoes';
  var POS = [
    { v: 'antes-sobre', t: 'Antes de «Sobre nós» (logo a seguir ao topo)' },
    { v: 'apos-sobre', t: 'Depois de «Sobre nós»' },
    { v: 'apos-servicos', t: 'Depois de «Serviços»' },
    { v: 'apos-planos', t: 'Depois de «Planos»' },
    { v: 'apos-extras', t: 'Depois de «Serviços extra»' },
    { v: 'apos-arquivo', t: 'Depois de «Arquivo» (antes do contacto)' }
  ];
  var posNome = function (v) { return (POS.filter(function (p) { return p.v === v; })[0] || POS[POS.length - 1]).t; };
  function carregarSecs() {
    status('A carregar…', 'busy');
    return G().listar(SEC_P).catch(function () { return []; }).then(function (fs) {
      fs = fs.filter(function (f) { return /\.json$/.test(f); }).sort();
      return Promise.all(fs.map(function (f) { return G().lerJSON(SEC_P + '/' + f).then(function (d) { return { ficheiro: f, data: d }; }); }));
    }).then(function (lista) {
      st.secs = lista.sort(function (a, b) { return (Number(a.data.ordem) || 0) - (Number(b.data.ordem) || 0); });
      st.carregado.seccoes = true; renderSecs(); status('Atualizado', 'ok');
    }).catch(function (e) {
      $('#tn-sc-grid').innerHTML = '<div class="tn-empty"><b>Não foi possível carregar</b><span>' + esc(e.message) + '</span></div>';
      status('Erro ao carregar', 'err');
    });
  }
  // ordem no site: secções fixas do site com as novas secções pelo meio
  var FIXAS = [
    { nome: 'Topo da página', depois: 'antes-sobre' },
    { nome: 'Sobre nós', depois: 'apos-sobre' },
    { nome: 'Serviços', depois: 'apos-servicos' },
    { nome: 'Planos', depois: 'apos-planos' },
    { nome: 'Serviços extra', depois: 'apos-extras' },
    { nome: 'Arquivo', depois: 'apos-arquivo' },
    { nome: 'Contacto', depois: null }
  ];
  function listaOrdem() {
    var out = [];
    FIXAS.forEach(function (f) {
      out.push({ fixa: true, nome: f.nome });
      if (!f.depois) return;
      st.secs.map(function (it, i) { return { it: it, i: i }; })
        .filter(function (x) { return (x.it.data.posicao || 'apos-arquivo') === f.depois; })
        .sort(function (a, b) { return (Number(a.it.data.ordem) || 0) - (Number(b.it.data.ordem) || 0); })
        .forEach(function (x) { out.push({ fixa: false, it: x.it, i: x.i }); });
    });
    return out;
  }
  function aplicarOrdem(lista) {
    var slot = null, n = 0;
    lista.forEach(function (x) {
      if (x.fixa) { var f = FIXAS.filter(function (y) { return y.nome === x.nome; })[0]; slot = f.depois; return; }
      n += 10;
      var d = x.it.data, mudou = d.posicao !== slot || Number(d.ordem) !== n;
      d.posicao = slot || 'apos-arquivo'; d.ordem = n;
      if (mudou) marcar(SEC_P + '/' + x.it.ficheiro);
    });
  }
  function moverSec(i, dir) {
    var lista = listaOrdem(), k = -1;
    lista.forEach(function (x, j) { if (!x.fixa && x.i === i) k = j; });
    var alvo = k + dir;
    if (k < 0 || alvo < 1 || alvo > lista.length - 2) return; // não passa acima do topo nem abaixo do contacto
    var t = lista[alvo]; lista[alvo] = lista[k]; lista[k] = t;
    aplicarOrdem(lista); renderSecs();
    status('Ordem alterada — falta publicar no site', 'busy');
    var b = document.querySelector('[data-mv="' + i + ':' + dir + '"]'); if (b && !b.disabled) b.focus();
  }
  function renderOrdem() {
    var box = $('#tn-sc-ordem'); if (!box) return;
    if (!st.secs.length) { box.innerHTML = '<p class="tn-f-help">Quando criares uma secção, aparece aqui e podes escolher onde fica no site.</p>'; return; }
    var lista = listaOrdem();
    box.innerHTML = lista.map(function (x, j) {
      if (x.fixa) return '<li class="tn-ord fixa"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><span>' + esc(x.nome) + '</span><small>fixa</small></li>';
      var d = x.it.data;
      return '<li class="tn-ord nova' + (d.visivel === false ? ' off' : '') + '"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg><span>' + esc(d.titulo || 'Sem título') + '</span>' +
        (d.visivel === false ? '<small>escondida</small>' : '') +
        '<button type="button" class="tn-icon-btn sm" data-mv="' + x.i + ':-1" aria-label="Subir ' + esc(d.titulo) + '" title="Subir"' + (j <= 1 ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg></button>' +
        '<button type="button" class="tn-icon-btn sm" data-mv="' + x.i + ':1" aria-label="Descer ' + esc(d.titulo) + '" title="Descer"' + (j >= lista.length - 2 ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button></li>';
    }).join('');
  }
  function renderSecs() {
    if (!st.secs) return;
    renderOrdem();
    $('#tn-sc-grid').innerHTML = st.secs.map(function (it, i) {
      var d = it.data, n = (d.cartoes || []).length, visivel = d.visivel !== false;
      var capa = (d.cartoes || []).filter(function (c) { return c.imagem; }).slice(0, 3);
      var sujo = st.sujos[SEC_P + '/' + it.ficheiro];
      return '<button type="button" class="tn-pc tn-in' + (visivel ? '' : ' off') + '" data-sec="' + i + '">' +
        '<span class="tn-pc-logo sm"><b>' + esc(d.titulo || 'Sem título') + '</b></span>' +
        (capa.length ? '<span class="tn-in-imgs">' + capa.map(function (c) { return '<img src="' + esc(src(c.imagem)) + '" alt="">'; }).join('') + '</span>' : '') +
        '<span class="tn-pc-desc sm">' + (d.subtitulo ? esc(d.subtitulo) : '<em>Sem subtítulo</em>') + '</span>' +
        '<span class="tn-pc-rows">' +
          '<span class="tn-pc-row"><i></i>Posição<b>' + esc(posNome(d.posicao).replace(/ \(.*\)$/, '')) + '</b></span>' +
          '<span class="tn-pc-row"><i></i>Cartões<b>' + n + '</b></span>' +
          '<span class="tn-pc-row"><i></i>No site<b class="' + (visivel ? 'g' : 'r') + '">' + (visivel ? 'Visível' : 'Escondida') + '</b></span>' +
        '</span>' +
        '<span class="tn-pc-foot">' + (sujo ? '<em>Por publicar</em>' : 'Editar secção') + ICON.arrow + '</span></button>';
    }).join('') + '<button type="button" class="tn-pc tn-pc-new" id="tn-sc-new"><span>' + ICON.plus + '</span>Criar nova secção</button>';
  }
  var secAtual = null, secCards = [];
  function abrirSec(i) {
    var it = i > -1 ? st.secs[i] : null, d = it ? it.data : { titulo: '', subtitulo: '', etiqueta: '', posicao: 'apos-arquivo', cartoes: [], visivel: true };
    secAtual = i;
    secCards = (d.cartoes || []).map(function (c) { return { imagem: c.imagem || '', titulo: c.titulo || '', texto: c.texto || '', titulo_en: c.titulo_en || '', texto_en: c.texto_en || '', file: null, url: c.imagem ? src(c.imagem) : '' }; });
    var f = $('#tn-sc-form');
    $('#tn-sc-t').textContent = it ? 'Editar secção' : 'Criar nova secção';
    f.titulo.value = d.titulo || ''; f.subtitulo.value = d.subtitulo || ''; f.etiqueta.value = d.etiqueta || '';
    f.titulo_en.value = d.titulo_en || ''; f.subtitulo_en.value = d.subtitulo_en || ''; f.etiqueta_en.value = d.etiqueta_en || '';
    abrirEN(f, f.titulo_en.value + f.subtitulo_en.value + f.etiqueta_en.value);
    f.posicao.innerHTML = POS.map(function (p) { return '<option value="' + p.v + '"' + (p.v === (d.posicao || 'apos-arquivo') ? ' selected' : '') + '>' + p.t + '</option>'; }).join('');
    f.visivel.checked = d.visivel !== false;
    $('#tn-sc-del').hidden = !it;
    $('#tn-sc-msg').textContent = '';
    renderSecCards();
    abrir($('#tn-sc-dlg'));
    setTimeout(function () { f.titulo.focus(); }, 30);
  }
  function renderSecCards() {
    var box = $('#tn-sc-cards');
    box.innerHTML = secCards.length ? secCards.map(function (c, j) {
      return '<div class="tn-scc" data-j="' + j + '">' +
        '<div class="tn-scc-img">' + (c.url ? '<img src="' + esc(c.url) + '" alt="">' : '<span>Sem imagem</span>') + '</div>' +
        '<div class="tn-scc-f">' +
          '<input type="text" data-c="titulo" value="' + esc(c.titulo) + '" placeholder="Título do cartão (opcional)" maxlength="120" aria-label="Título do cartão ' + (j + 1) + '">' +
          '<textarea data-c="texto" rows="2" placeholder="Texto (opcional)" maxlength="800" aria-label="Texto do cartão ' + (j + 1) + '">' + esc(c.texto) + '</textarea>' +
          '<div class="tn-scc-en"><span class="tn-en-flag">EN</span>' +
            '<input type="text" data-c="titulo_en" value="' + esc(c.titulo_en || '') + '" placeholder="Título em inglês (opcional)" maxlength="120" aria-label="Título em inglês do cartão ' + (j + 1) + '">' +
            '<textarea data-c="texto_en" rows="2" placeholder="Texto em inglês (opcional)" maxlength="800" aria-label="Texto em inglês do cartão ' + (j + 1) + '">' + esc(c.texto_en || '') + '</textarea></div>' +
          '<div class="tn-scc-a">' +
            '<label class="tn-mini-link"><input type="file" accept="image/*" hidden data-c="img">' + (c.url ? 'Trocar imagem' : 'Adicionar imagem') + '</label>' +
            (c.url ? '<button type="button" class="tn-mini-link" data-a="semimg">Tirar imagem</button>' : '') +
            '<span class="tn-scc-sp"></span>' +
            '<button type="button" class="tn-icon-btn sm" data-a="up" aria-label="Subir" title="Subir"' + (j ? '' : ' disabled') + '>' + ICON.prev.replace('M15 18l-6-6 6-6', 'M18 15l-6-6-6 6') + '</button>' +
            '<button type="button" class="tn-icon-btn sm" data-a="down" aria-label="Descer" title="Descer"' + (j < secCards.length - 1 ? '' : ' disabled') + '>' + ICON.prev.replace('M15 18l-6-6 6-6', 'M6 9l6 6 6-6') + '</button>' +
            '<button type="button" class="tn-icon-btn sm" data-a="rm" aria-label="Apagar cartão" title="Apagar cartão">' + ICON.del + '</button>' +
          '</div></div></div>';
    }).join('') : '<p class="tn-f-help">Ainda sem cartões. Uma secção pode ter só título e subtítulo, ou cartões com imagem, título e texto.</p>';
  }
  function guardarSec(e) {
    e.preventDefault();
    var f = e.target, titulo = f.titulo.value.trim();
    if (!titulo) { $('#tn-sc-msg').textContent = 'Escreve o título da secção.'; f.titulo.focus(); return; }
    var lista = st.secs, it;
    if (secAtual > -1) it = lista[secAtual];
    else {
      var ordem = lista.reduce(function (m, x) { return Math.max(m, Number(x.data.ordem) || 0); }, 0) + 10;
      it = { ficheiro: String(lista.length + 1).padStart(2, '0') + '-' + G().slug(titulo) + '-' + Date.now().toString(36).slice(-4) + '.json', data: { ordem: ordem } };
      lista.push(it);
    }
    var d = it.data;
    d.id = G().slug(titulo);
    d.titulo = titulo; d.subtitulo = f.subtitulo.value.trim(); d.etiqueta = f.etiqueta.value.trim();
    d.titulo_en = f.titulo_en.value.trim(); d.subtitulo_en = f.subtitulo_en.value.trim(); d.etiqueta_en = f.etiqueta_en.value.trim();
    if (d.posicao !== f.posicao.value) d.ordem = 100000 + Date.now() % 100000; // vai para o fim do sítio escolhido
    d.posicao = f.posicao.value; d.visivel = f.visivel.checked;
    d.cartoes = secCards.map(function (c) {
      var img = c.imagem;
      if (c.file) { img = juntarMedia(c.file, titulo + '-cartao'); }
      return { imagem: img || '', titulo: c.titulo.trim(), texto: c.texto.trim(), titulo_en: (c.titulo_en || '').trim(), texto_en: (c.texto_en || '').trim() };
    }).filter(function (c) { return c.imagem || c.titulo || c.texto; });
    marcar(SEC_P + '/' + it.ficheiro);
    aplicarOrdem(listaOrdem());
    fechar($('#tn-sc-dlg')); renderSecs();
    status('Guardado — falta publicar no site', 'busy');
  }
  function apagarSec() {
    var it = st.secs[secAtual]; if (!it) return;
    fechar($('#tn-sc-dlg'));
    window.TNDash.confirm('Apagar secção?', 'A secção <b>' + esc(it.data.titulo) + '</b> sai do site quando publicares as alterações.', 'Apagar', function () {
      var c = SEC_P + '/' + it.ficheiro;
      st.secs.splice(secAtual, 1); delete st.sujos[c]; st.apagar[c] = true; barra(); renderSecs();
    });
  }

  /* ---------- publicar ---------- */
  function publicar() {
    if (st.publicando || !nPendentes()) return;
    st.publicando = true;
    var btn = $('#tn-pub-go'); btn.disabled = true; btn.textContent = 'A publicar…';
    status('A publicar…', 'busy');
    var alt = st.media.map(function (m) { return { caminho: m.caminho, ficheiro: m.ficheiro }; });
    Object.keys(st.sujos).forEach(function (c) {
      var dados = null;
      st.planos.forEach(function (p) { if ('content/planos/' + p.ficheiro === c) dados = p.data; });
      Object.keys(SEC).forEach(function (k) { if (SEC[k].ficheiro === c && st.arquivo) dados = st.arquivo[k]; });
      Object.keys(COL).forEach(function (k) { (st.cols[k] || []).forEach(function (it) { if (COL[k].pasta + '/' + it.ficheiro === c) dados = it.data; }); });
      if (c === SITE_F && st.site) dados = st.site;
      (st.secs || []).forEach(function (it) { if (SEC_P + '/' + it.ficheiro === c) dados = it.data; });
      if (dados) alt.push({ caminho: c, texto: JSON.stringify(dados, null, 2) + '\n' });
    });
    Object.keys(st.apagar).forEach(function (c) { alt.push({ caminho: c, apagar: true }); });
    var partes = [];
    var todos = Object.keys(st.sujos).concat(Object.keys(st.apagar));
    if (todos.indexOf(SITE_F) > -1) partes.unshift('página inicial');
    if (todos.some(function (c) { return c.indexOf(SEC_P + '/') === 0; })) partes.push('secções');
    if (todos.some(function (c) { return c.indexOf('content/servicos/') === 0; })) partes.push('o que fazemos');
    if (todos.some(function (c) { return c.indexOf('content/extras/') === 0; })) partes.push('serviços extra');
    if (Object.keys(st.sujos).some(function (c) { return c.indexOf('content/planos/') === 0; })) partes.push('planos');
    if (Object.keys(st.sujos).some(function (c) { return c.indexOf('content/galeria/') === 0; })) partes.push('arquivo');
    G().publicar(alt, 'Painel: atualiza ' + (partes.join(' e ') || 'conteúdo')).then(function () {
      st.sujos = {}; st.media = []; st.apagar = {};
      status('Publicado! O site atualiza em 1–2 minutos.', 'ok');
      renderPlanos(); renderArquivo(); renderInicio(); renderSecs(); Object.keys(COL).forEach(function (k) { if (st.cols[k]) renderCol(k); });
    }).catch(function (e) {
      status('Não foi possível publicar: ' + e.message, 'err');
    }).then(function () {
      st.publicando = false; btn.disabled = false; btn.textContent = 'Publicar no site'; barra();
    });
  }
  function descartar() {
    window.TNDash.confirm('Descartar alterações?', 'As alterações que ainda não publicaste perdem-se.', 'Descartar', function () {
      st.sujos = {}; st.media = []; st.apagar = {}; st.carregado = { planos: false, arquivo: false, servicos: false, extras: false, inicio: false, seccoes: false };
      barra();
      if (document.body.classList.contains('tn-on-planos')) carregarPlanos();
      if (document.body.classList.contains('tn-on-arquivo')) carregarArquivo();
      if (document.body.classList.contains('tn-on-inicio')) carregarInicio();
      if (document.body.classList.contains('tn-on-seccoes')) carregarSecs();
      if (document.body.classList.contains('tn-on-servicos')) carregarCol('servicos');
      if (document.body.classList.contains('tn-on-extras')) carregarCol('extras');
    });
  }

  /* ---------- janelas ---------- */
  function abrir(d) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  function fechar(d) { if (d.close) d.close(); else d.removeAttribute('open'); }

  function bind() {
    $('#tn-planos-grid').addEventListener('click', function (e) { var b = e.target.closest('[data-plano]'); if (b) abrirPlano(+b.getAttribute('data-plano')); });
    $('#tn-pl-form').addEventListener('submit', guardarPlano);
    $('#tn-arq-wrap').addEventListener('click', function (e) {
      var c = e.target.closest('[data-car]');
      if (c) { moverCarrossel(c.closest('.tn-car'), +c.getAttribute('data-car')); return; }
      var n = e.target.closest('[data-nova]'); if (n) { abrirPub(n.getAttribute('data-nova'), -1); return; }
      var b = e.target.closest('[data-pub]'); if (!b) return;
      var p = b.getAttribute('data-pub').split(':');
      if (b.getAttribute('data-a') === 'edit') abrirPub(p[0], +p[1]); else apagarPub(p[0], +p[1]);
    });
    $('#tn-pub-form').addEventListener('submit', guardarPub);
    $('#tn-pub-form').ficheiro.addEventListener('change', escolherFicheiros);
    $('#tn-pub-files').addEventListener('click', function (e) {
      var b = e.target.closest('[data-rm]'); if (!b) return;
      pub.ficheiros.splice(+b.getAttribute('data-rm'), 1); renderPubFicheiros();
    });
    $$('[data-fechar]').forEach(function (b) { b.addEventListener('click', function () { fechar(b.closest('dialog')); }); });
    $$('.tn-dlg2').forEach(function (d) { d.addEventListener('click', function (e) { if (e.target === d) fechar(d); }); });
    ['servicos', 'extras'].forEach(function (k) {
      $(COL[k].grid).addEventListener('click', function (e) {
        var n = e.target.closest('[data-col-novo]'); if (n) { abrirCol(n.getAttribute('data-col-novo'), -1); return; }
        var b = e.target.closest('[data-col]'); if (!b) return;
        var p = b.getAttribute('data-col').split(':'); abrirCol(p[0], +p[1]);
      });
    });
    $('#tn-sv-form').addEventListener('submit', guardarCol);
    $('#tn-in-grid').addEventListener('click', function (e) { var b = e.target.closest('[data-bloco]'); if (b) abrirBloco(+b.getAttribute('data-bloco')); });
    $('#tn-in-form').addEventListener('submit', guardarBloco);
    $('#tn-sc-grid').addEventListener('click', function (e) {
      if (e.target.closest('#tn-sc-new')) { abrirSec(-1); return; }
      var b = e.target.closest('[data-sec]'); if (b) abrirSec(+b.getAttribute('data-sec'));
    });
    $('#tn-sc-form').addEventListener('submit', guardarSec);
    $('#tn-sc-ordem').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mv]'); if (!b || b.disabled) return;
      var p = b.getAttribute('data-mv').split(':'); moverSec(+p[0], +p[1]);
    });
    $('#tn-sc-del').addEventListener('click', apagarSec);
    $('#tn-sc-add').addEventListener('click', function () { secCards.push({ imagem: '', titulo: '', texto: '', titulo_en: '', texto_en: '', file: null, url: '' }); renderSecCards(); var l = $$('#tn-sc-cards .tn-scc input[data-c=titulo]'); if (l.length) l[l.length - 1].focus(); });
    var cardBox = $('#tn-sc-cards');
    cardBox.addEventListener('input', function (e) {
      var el = e.target, row = el.closest('[data-j]'); if (!row || !el.getAttribute('data-c') || el.type === 'file') return;
      secCards[+row.getAttribute('data-j')][el.getAttribute('data-c')] = el.value;
    });
    cardBox.addEventListener('change', function (e) {
      var el = e.target; if (el.type !== 'file') return;
      var row = el.closest('[data-j]'), file = el.files && el.files[0]; el.value = ''; if (!file || !row) return;
      if (file.size > 15e6) { $('#tn-sc-msg').textContent = 'A imagem tem mais de 15 MB.'; return; }
      prepararFoto(file).then(function (f) { var c = secCards[+row.getAttribute('data-j')]; c.file = f; c.url = URL.createObjectURL(f); renderSecCards(); });
    });
    cardBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      var j = +b.closest('[data-j]').getAttribute('data-j'), a = b.getAttribute('data-a'), t;
      if (a === 'rm') secCards.splice(j, 1);
      else if (a === 'semimg') { secCards[j].imagem = ''; secCards[j].file = null; secCards[j].url = ''; }
      else if (a === 'up' && j > 0) { t = secCards[j - 1]; secCards[j - 1] = secCards[j]; secCards[j] = t; }
      else if (a === 'down' && j < secCards.length - 1) { t = secCards[j + 1]; secCards[j + 1] = secCards[j]; secCards[j] = t; }
      renderSecCards();
    });
    $('#tn-in-body').addEventListener('change', function (e) {
      var inp = e.target; if (!inp.hasAttribute('data-img')) return;
      var file = inp.files && inp.files[0]; inp.value = ''; if (!file) return;
      var video = /^video\//.test(file.type);
      var box = document.getElementById(inp.getAttribute('data-prev'));
      if (file.size > (video ? 40 : 15) * 1e6) { box.innerHTML = '<em class="tn-in-err">Ficheiro demasiado grande (máx. ' + (video ? 40 : 15) + ' MB).</em>'; return; }
      (video ? Promise.resolve(file) : prepararFoto(file)).then(function (f) {
        imgNovas[inp.getAttribute('data-img')] = f;
        var url = URL.createObjectURL(f);
        box.innerHTML = video ? '<video src="' + url + '" muted loop autoplay playsinline></video>' : '<img src="' + url + '" alt="">';
      });
    });
    $('#tn-sv-del').addEventListener('click', apagarCol);
    $('#tn-pub-go').addEventListener('click', publicar);
    $('#tn-pub-x').addEventListener('click', descartar);
    window.addEventListener('beforeunload', function (e) { if (nPendentes() || st.publicando) { e.preventDefault(); e.returnValue = ''; } });
  }

  var bound = false;
  function prep() { if (!bound) { bind(); bound = true; } barra(); }
  window.TNConteudo = {
    planos: function () { prep(); if (!st.carregado.planos) carregarPlanos(); else renderPlanos(); },
    arquivo: function () { prep(); if (!st.carregado.arquivo) carregarArquivo(); else renderArquivo(); },
    col: function (k) { prep(); if (!st.carregado[k]) carregarCol(k); else renderCol(k); },
    inicio: function () { prep(); if (!st.carregado.inicio) carregarInicio(); else renderInicio(); },
    seccoes: function () { prep(); if (!st.carregado.seccoes) carregarSecs(); else renderSecs(); },
    _texto: { pontosParaTexto: pontosParaTexto, textoParaPontos: textoParaPontos }
  };
})();
