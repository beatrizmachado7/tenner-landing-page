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
  var plansData = null, waCfg = {};
  function waHref(msg) {
    var link = String(waCfg.link || '').trim();
    if (!link) return '';
    if (/^[+\d\s()-]+$/.test(link)) link = 'https://wa.me/' + link.replace(/\D/g, '');
    else if (!/^https?:\/\//i.test(link)) link = 'https://' + link;
    link = link.replace(/([?&])text=[^&#]*&?/i, '$1').replace(/[?&]$/, '');
    return link + (link.indexOf('?') > -1 ? '&' : '?') + 'text=' + encodeURIComponent(msg);
  }
  function planMsg(p, full) {
    var tpl = p.whatsapp_message || waCfg.message || 'Olá! Tenho interesse no plano {plano} da TENNER.';
    return String(tpl).replace(/\{plano\}/gi, full);
  }
  function renderPlans() {
    var d = plansData; if (!d) return;
    $('#plans').innerHTML = (d.plans || []).map(function (p) {
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
        (function () {
          var href = waHref(planMsg(p, full));
          return '<a class="btn ' + (p.featured ? 'btn-y' : 'btn-o') + '" href="' + esc(href || '#contacto') + '"' +
            (href ? ' target="_blank" rel="noopener"' : '') + ' data-plan="' + esc(full) + '">Quero o ' + esc(full) + '</a>';
        })() +
        '</article>';
    }).join('');
  }

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

  /* ---------- arquivo.json (3 colunas) ---------- */
  var chevL = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M11 3L5 9l6 6"/></svg>';
  var chevR = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M7 3l6 6-6 6"/></svg>';
  function colTitle(id, col) { if (col && col.title) $('#' + id + '-t').textContent = col.title; }
  function renderArchive(data) {
    var est = data.estatico || { items: [] }, mot = data.motion || { items: [] }, soc = data.social || { items: [] };
    colTitle('col-estatico', est); colTitle('col-motion', mot); colTitle('col-social', soc);

    // Pre match estático: fotos inteiras, sem cortes
    var e = $('#col-estatico');
    e.innerHTML = est.items.map(function (w, i) {
      return '<button type="button" class="arch-item" data-i="' + i + '" aria-label="Ver ' + esc(w.title || 'imagem') + '">' +
        '<img src="' + esc(w.image) + '" alt="' + esc(w.title || 'Pre match') + '" loading="lazy"></button>';
    }).join('');
    $$('.arch-item', e).forEach(function (b) {
      b.addEventListener('click', function () { openLb(est.items[+b.getAttribute('data-i')]); });
    });

    // Pre match motion: vídeos a tocar sozinhos (sem som, em loop)
    var m = $('#col-motion');
    m.innerHTML = mot.items.map(function (w) {
      return '<div class="arch-item vid"><video src="' + esc(w.video) + '" autoplay muted loop playsinline preload="metadata"' +
        (w.title ? ' aria-label="' + esc(w.title) + '"' : '') + '></video></div>';
    }).join('');
    var vids = $$('video', m);
    vids.forEach(function (v) {
      v.muted = true; v.defaultMuted = true;
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    });
    if ('IntersectionObserver' in window) {
      var vio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { var p = en.target.play(); if (p && p.catch) p.catch(function () {}); }
          else en.target.pause();
        });
      }, { threshold: 0.1 });
      vids.forEach(function (v) { vio.observe(v); });
    }

    // Social media: carrosséis
    var s = $('#col-social');
    s.innerHTML = soc.items.map(function (c) {
      var n = c.images.length;
      return '<div class="car" tabindex="0" aria-roledescription="carrossel" aria-label="' + esc(c.title || 'Carrossel') + '">' +
        '<div class="car-view"><div class="car-track">' + c.images.map(function (src, k) {
          return '<div class="car-slide" aria-label="' + (k + 1) + ' de ' + n + '"><img src="' + esc(src) + '" alt="' + esc((c.title || 'Carrossel') + ' ' + (k + 1)) + '" loading="lazy"></div>';
        }).join('') + '</div>' +
        (n > 1 ? '<button type="button" class="car-btn prev" aria-label="Anterior">' + chevL + '</button>' +
          '<button type="button" class="car-btn next" aria-label="Seguinte">' + chevR + '</button>' +
          '<div class="car-count"><span class="cur">1</span> / ' + n + '</div>' : '') +
        '</div>' +
        (n > 1 ? '<div class="car-dots">' + c.images.map(function (_, k) { return '<span' + (k === 0 ? ' class="on"' : '') + '></span>'; }).join('') + '</div>' : '') +
        '</div>';
    }).join('');
    $$('.car', s).forEach(initCarousel);
  }

  function initCarousel(car) {
    var track = $('.car-track', car), view = $('.car-view', car);
    var slides = $$('.car-slide', car), dots = $$('.car-dots span', car), cur = $('.cur', car);
    var prev = $('.prev', car), next = $('.next', car);
    var i = 0, n = slides.length;
    function fit() {
      var img = $('img', slides[i]);
      if (img && img.offsetHeight) view.style.height = img.offsetHeight + 'px';
    }
    function go(k) {
      i = Math.max(0, Math.min(n - 1, k));
      track.style.transform = 'translateX(' + (-100 * i) + '%)';
      dots.forEach(function (d, j) { d.classList.toggle('on', j === i); });
      if (cur) cur.textContent = i + 1;
      if (prev) prev.disabled = i === 0;
      if (next) next.disabled = i === n - 1;
      fit();
    }
    if (prev) prev.addEventListener('click', function () { go(i - 1); });
    if (next) next.addEventListener('click', function () { go(i + 1); });
    car.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') go(i - 1);
      if (e.key === 'ArrowRight') go(i + 1);
    });
    var x0 = null;
    view.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    view.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
    });
    $$('img', car).forEach(function (img) { img.addEventListener('load', fit); });
    window.addEventListener('resize', fit);
    go(0);
  }

  /* ---------- lightbox ---------- */
  var lb = $('#lb'), lbIn = $('#lb-in'), lastFocus = null;
  function openLb(w) {
    if (!w) return;
    lastFocus = document.activeElement;
    lbIn.innerHTML = (w.video
      ? '<video src="' + esc(w.video) + '" poster="' + esc(w.image) + '" controls autoplay playsinline></video>'
      : '<img src="' + esc(w.image) + '" alt="' + esc(w.title) + '">') +
      (w.title ? '<div class="disp" style="font-size:24px">' + esc(w.title) + '</div>' : '');
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
    if (r[0]) { renderSite(r[0]); waCfg = r[0].whatsapp || {}; }
    if (r[1]) renderServices(r[1]);
    if (r[2]) { plansData = r[2]; renderPlans(); }
    if (r[3]) renderExtras(r[3]);
    if (r[4]) renderArchive(r[4]);
    observe();
  });
})();
