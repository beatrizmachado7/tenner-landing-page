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
    apagar: {},        // caminho → true (ficheiros a apagar)
    carregado: { planos: false, arquivo: false, servicos: false, extras: false },
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
  function descDe(k, d) { return k === 'extras' ? [d.subtitle || '', d.text || ''].filter(function (x, i) { return x || i === 0; }).join('\n').replace(/\n$/, '') : (d.text || ''); }
  function aplicarDesc(k, d, txt) {
    txt = String(txt || '').replace(/\r/g, '').trim();
    if (k === 'extras') { var i = txt.indexOf('\n'); d.subtitle = (i < 0 ? txt : txt.slice(0, i)).trim(); d.text = i < 0 ? '' : txt.slice(i + 1).trim(); }
    else d.text = txt;
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
      if (dados) alt.push({ caminho: c, texto: JSON.stringify(dados, null, 2) + '\n' });
    });
    Object.keys(st.apagar).forEach(function (c) { alt.push({ caminho: c, apagar: true }); });
    var partes = [];
    var todos = Object.keys(st.sujos).concat(Object.keys(st.apagar));
    if (todos.some(function (c) { return c.indexOf('content/servicos/') === 0; })) partes.push('o que fazemos');
    if (todos.some(function (c) { return c.indexOf('content/extras/') === 0; })) partes.push('serviços extra');
    if (Object.keys(st.sujos).some(function (c) { return c.indexOf('content/planos/') === 0; })) partes.push('planos');
    if (Object.keys(st.sujos).some(function (c) { return c.indexOf('content/galeria/') === 0; })) partes.push('arquivo');
    G().publicar(alt, 'Painel: atualiza ' + (partes.join(' e ') || 'conteúdo')).then(function () {
      st.sujos = {}; st.media = []; st.apagar = {};
      status('Publicado! O site atualiza em 1–2 minutos.', 'ok');
      renderPlanos(); renderArquivo(); Object.keys(COL).forEach(function (k) { if (st.cols[k]) renderCol(k); });
    }).catch(function (e) {
      status('Não foi possível publicar: ' + e.message, 'err');
    }).then(function () {
      st.publicando = false; btn.disabled = false; btn.textContent = 'Publicar no site'; barra();
    });
  }
  function descartar() {
    window.TNDash.confirm('Descartar alterações?', 'As alterações que ainda não publicaste perdem-se.', 'Descartar', function () {
      st.sujos = {}; st.media = []; st.apagar = {}; st.carregado = { planos: false, arquivo: false, servicos: false, extras: false };
      barra();
      if (document.body.classList.contains('tn-on-planos')) carregarPlanos();
      if (document.body.classList.contains('tn-on-arquivo')) carregarArquivo();
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
    _texto: { pontosParaTexto: pontosParaTexto, textoParaPontos: textoParaPontos }
  };
})();
