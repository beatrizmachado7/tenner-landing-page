(function () {
  'use strict';

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var get = function (obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  };
  var load = function (name) {
    return fetch('/content/' + name + '.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(name + ': ' + r.status);
      return r.json();
    });
  };
  var tri = '<svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true"><path d="M1 1l10 9-10 9z" fill="#efe3a0"/></svg>';
  var playIcon = '<span class="play" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" fill="#f4f1e8"/></svg></span>';

  /* ---------- site.json ---------- */
  function renderSite(site) {
    $$('[data-bind]').forEach(function (el) {
      var v = get(site, el.getAttribute('data-bind'));
      if (v != null) el.textContent = v;
    });
    $$('[data-src]').forEach(function (el) {
      var v = get(site, el.getAttribute('data-src'));
      if (v) el.src = v;
    });
    var words = (site.marquee || []);
    var loop = words.concat(words, words, words);
    $('#marquee').innerHTML = loop.map(function (w) {
      return '<span>' + esc(w) + '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 1l10 8-10 8z" fill="#0a0a0a"/></svg></span>';
    }).join('');
    $('#audience').innerHTML = ((site.about && site.about.audience) || []).map(function (a) {
      return '<span class="chip">' + esc(a) + '</span>';
    }).join('');
    var c = site.contact || {};
    var mail = $('#mail'), insta = $('#insta');
    if (c.email) { mail.href = 'mailto:' + c.email; $('span', mail).textContent = c.email; } else mail.hidden = true;
    if (c.instagram) {
      var handle = String(c.instagram).replace(/^@/, '');
      insta.href = 'https://instagram.com/' + encodeURIComponent(handle);
      $('span', insta).textContent = '@' + handle;
    } else insta.hidden = true;
  }

  /* ---------- servicos.json ---------- */
  function renderServices(data) {
    $('#servicos-intro').textContent = data.intro || '';
    $('#servicos-list').innerHTML = (data.items || []).map(function (s, i) {
      return '<article class="svc reveal"><div class="disp n">' + String(i + 1).padStart(2, '0') + '</div>' +
        '<h3 class="disp">' + esc(s.title) + '</h3><p>' + esc(s.text) + '</p></article>';
    }).join('');
  }

  /* ---------- planos.json ---------- */
  var plansData = null, billing = 'mensal';
  function renderPlans() {
    var d = plansData; if (!d) return;
    var pct = d.season_discount || 0;
    var season = billing === 'epoca';
    var eligible = (d.plans || []).filter(function (p) { return p.season_discount; })
      .map(function (p) { return p.name + (p.suffix ? ' ' + p.suffix : ''); });
    $('#season-btn').textContent = 'À época' + (pct ? ' −' + pct + '%' : '');
    $('#season-note').textContent = pct && eligible.length
      ? 'Desconto de ' + pct + '% à época exclusivo ' + eligible.join(' e ') : '';
    $('#plans-foot').textContent = d.footnote || '';
    $('#plans').innerHTML = (d.plans || []).map(function (p) {
      var note = p.price_note || '';
      if (season) note = p.season_discount ? '−' + pct + '% no pagamento à época' : 'Desconto à época não aplicável';
      var full = p.name + (p.suffix ? ' ' + p.suffix : '');
      var feats = (p.features || []).map(function (f) {
        var main = esc(f.text || '');
        if (f.offer) main += (main ? ' + ' : '') + '<b>OFERTA</b> ' + esc(f.offer);
        return '<li>' + tri + '<div><div class="feat-m">' + main + '</div>' +
          (f.detail ? '<div class="feat-s">' + esc(f.detail) + '</div>' : '') + '</div></li>';
      }).join('');
      return '<article class="plan reveal in' + (p.featured ? ' featured' : '') + '">' +
        (p.featured ? '<div class="badge disp">Mais completo</div>' : '') +
        '<div class="disp plan-name">' + esc(p.name) + (p.suffix ? '<span class="ital">' + esc(p.suffix) + '</span>' : '') + '</div>' +
        '<ul class="feats">' + feats + '</ul>' +
        '<div class="price"><div class="disp v' + (/\d/.test(p.price || '') ? '' : ' long') + '">' + esc(p.price) + '</div><div class="note">' + esc(note) + '</div></div>' +
        '<a class="btn ' + (p.featured ? 'btn-y' : 'btn-o') + '" href="#contacto" data-plan="' + esc(full) + '">Quero o ' + esc(full) + '</a>' +
        '</article>';
    }).join('');
  }
  $$('[data-billing]').forEach(function (b) {
    b.addEventListener('click', function () {
      billing = b.getAttribute('data-billing');
      $$('[data-billing]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      renderPlans();
      $$('.price .v').forEach(function (v) { v.classList.add('bump'); setTimeout(function () { v.classList.remove('bump'); }, 300); });
    });
  });

  /* ---------- extras.json ---------- */
  function renderExtras(data) {
    $('#extras-intro').textContent = data.intro || '';
    var box = $('#extras');
    box.innerHTML = (data.items || []).map(function (e, i) {
      return '<button type="button" class="extra reveal' + (e.highlight ? ' hot' : '') + '" aria-expanded="false" style="margin-left:' + (i * 4) + '%;width:' + (100 - i * 4) + '%">' +
        '<span class="tri"></span><span class="body"><span class="row"><span class="disp t">' + esc(e.title) + '</span><span class="disp sign" aria-hidden="true">+</span></span>' +
        '<span class="sub">' + esc(e.subtitle) + '</span>' +
        (e.text ? '<span class="more"><span>' + esc(e.text) + '</span></span>' : '') + '</span></button>';
    }).join('');
    $$('.extra', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        $$('.extra', box).forEach(function (x) { x.setAttribute('aria-expanded', 'false'); });
        btn.setAttribute('aria-expanded', String(!open));
      });
    });
  }

  /* ---------- arquivo.json ---------- */
  function renderArchive(data) {
    var g = $('#gallery');
    g.innerHTML = (data.items || []).map(function (w, i) {
      var fmt = ['vertical', 'retrato', 'quadrado'].indexOf(w.format) > -1 ? w.format : 'quadrado';
      return '<button type="button" class="tile reveal ' + fmt + '" data-cat="' + esc(w.category) + '" data-i="' + i + '" aria-label="Abrir ' + esc(w.title) + '">' +
        '<img src="' + esc(w.image) + '" alt="' + esc(w.title) + '" loading="lazy">' +
        (w.video ? playIcon : '') +
        '<span class="cap"><span class="disp">' + esc(w.title) + '</span>' + (w.tag ? '<span class="tag">' + esc(w.tag) + '</span>' : '') + '</span></button>';
    }).join('');
    $$('.tile', g).forEach(function (t) {
      t.addEventListener('click', function () { openLb(data.items[+t.getAttribute('data-i')]); });
    });
  }
  $$('[data-filter]').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = b.getAttribute('data-filter');
      $$('[data-filter]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
      $$('#gallery .tile').forEach(function (t) {
        var show = f === 'todos' || t.getAttribute('data-cat') === f;
        t.classList.toggle('hidden', !show);
        if (show) { t.classList.remove('in'); requestAnimationFrame(function () { t.classList.add('in'); }); }
      });
    });
  });

  /* ---------- lightbox ---------- */
  var lb = $('#lb'), lbIn = $('#lb-in'), lastFocus = null;
  function openLb(w) {
    if (!w) return;
    lastFocus = document.activeElement;
    lbIn.innerHTML = (w.video
      ? '<video src="' + esc(w.video) + '" poster="' + esc(w.image) + '" controls autoplay playsinline></video>'
      : '<img src="' + esc(w.image) + '" alt="' + esc(w.title) + '">') +
      '<div class="disp" style="font-size:24px">' + esc(w.title) + '</div>';
    lb.classList.add('open');
    $('#lb-close').focus();
  }
  function closeLb() {
    lb.classList.remove('open'); lbIn.innerHTML = '';
    if (lastFocus) lastFocus.focus();
  }
  $('#lb-close').addEventListener('click', closeLb);
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && lb.classList.contains('open')) closeLb(); });

  /* ---------- scroll reveal + active nav ---------- */
  function observe() {
    if (!('IntersectionObserver' in window)) { $$('.reveal').forEach(function (el) { el.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    $$('.reveal:not(.in)').forEach(function (el) { io.observe(el); });
    var links = $$('.nav a');
    var navIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['sobre', 'servicos', 'planos', 'arquivo'].forEach(function (id) { var s = document.getElementById(id); if (s) navIo.observe(s); });
  }

  Promise.all(['site', 'servicos', 'planos', 'extras', 'arquivo'].map(function (n) {
    return load(n).catch(function (err) { console.error('[TENNER] falha a carregar', err); return null; });
  })).then(function (r) {
    if (r[0]) renderSite(r[0]);
    if (r[1]) renderServices(r[1]);
    if (r[2]) { plansData = r[2]; renderPlans(); }
    if (r[3]) renderExtras(r[3]);
    if (r[4]) renderArchive(r[4]);
    observe();
  });
})();
