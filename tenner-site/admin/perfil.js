/* TENNER. — o meu perfil (foto, nome e descrição)
   Guardado na conta do Netlify Identity (user_metadata): não cria nenhuma publicação do site. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var fotoNova = null; // data URL da foto escolhida (ou '' para remover)

  function user() { var id = window.netlifyIdentity; return id && id.currentUser && id.currentUser(); }
  function meta(u) { return (u && u.user_metadata) || {}; }

  // mostra nome/foto no menu lateral
  function aplicar(u) {
    if (!u) return;
    var m = meta(u), mail = u.email || '';
    var nome = m.full_name || mail.split('@')[0] || 'TENNER.';
    $('#tn-user-name').textContent = nome;
    $('#tn-user-mail').textContent = m.bio ? m.bio : mail;
    var av = $('#tn-avatar');
    if (m.avatar) { av.innerHTML = '<img src="' + m.avatar.replace(/"/g, '') + '" alt="">'; av.classList.add('img'); }
    else { av.textContent = nome.charAt(0).toUpperCase(); av.classList.remove('img'); }
  }

  // reduz a foto para 256×256 (corte quadrado ao centro)
  function reduzir(file) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas');
        c.width = c.height = 256;
        c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { rej(new Error('Esta imagem não pode ser usada. Experimenta um JPG ou PNG.')); };
      img.src = url;
    });
  }
  function preview(src, nome) {
    var p = $('#tn-pf-foto');
    if (src) p.innerHTML = '<img src="' + src + '" alt="A tua foto">';
    else p.textContent = (nome || '?').charAt(0).toUpperCase();
    $('#tn-pf-rm').hidden = !src;
  }

  function abrirPerfil() {
    var u = user(); if (!u) return;
    var m = meta(u), f = $('#tn-pf-form');
    fotoNova = null;
    f.nome.value = m.full_name || '';
    f.bio.value = m.bio || '';
    $('#tn-pf-mail').textContent = u.email || '';
    $('#tn-pf-msg').textContent = ''; $('#tn-pf-msg').className = 'tn-pf-msg';
    preview(m.avatar || '', m.full_name || u.email);
    var d = $('#tn-pf-dlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  function fechar() { var d = $('#tn-pf-dlg'); if (d.close) d.close(); else d.removeAttribute('open'); }

  function bind() {
    $('#tn-user-open').addEventListener('click', abrirPerfil);
    $('#tn-pf-file').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0]; e.target.value = '';
      if (!file) return;
      reduzir(file).then(function (d) { fotoNova = d; preview(d); })
        .catch(function (err) { $('#tn-pf-msg').textContent = err.message; $('#tn-pf-msg').className = 'tn-pf-msg err'; });
    });
    $('#tn-pf-rm').addEventListener('click', function () { fotoNova = ''; preview('', $('#tn-pf-form').nome.value || '?'); });
    $('#tn-pf-cancel').addEventListener('click', fechar);
    $('#tn-pf-dlg').addEventListener('click', function (e) { if (e.target === this) fechar(); });
    $('#tn-pf-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, u = user(), msg = $('#tn-pf-msg'), b = $('#tn-pf-ok');
      if (!u) return;
      var data = { full_name: f.nome.value.trim().slice(0, 80), bio: f.bio.value.trim().slice(0, 160) };
      if (fotoNova !== null) data.avatar = fotoNova;
      b.disabled = true; msg.textContent = 'A guardar…'; msg.className = 'tn-pf-msg';
      var guardar = window.TN_PREVIEW ? Promise.resolve(Object.assign(u, { user_metadata: Object.assign({}, u.user_metadata, data) })) : u.update({ data: data });
      guardar.then(function (nu) {
        aplicar(nu || u); fechar();
      }).catch(function (err) {
        msg.textContent = 'Não foi possível guardar: ' + ((err && err.message) || 'tenta de novo'); msg.className = 'tn-pf-msg err';
      }).then(function () { b.disabled = false; });
    });
  }

  bind();
  window.TNPerfil = { aplicar: aplicar };
})();
