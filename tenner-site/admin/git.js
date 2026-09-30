/* TENNER. — ler e publicar ficheiros do site através do Git Gateway do Netlify (o mesmo que o Decap usa).
   Todas as alterações de uma vez vão num único commit → uma única publicação no Netlify.
   Os ficheiros do site estão dentro da pasta tenner-site/ do repositório.
   Pré-visualização: com window.TN_PREVIEW = true usa window.TN_PREVIEW_GIT. */
(function () {
  'use strict';
  var BASE = '/.netlify/git/github';
  var BRANCH = 'main';
  var RAIZ = 'tenner-site/';

  function token() {
    var id = window.netlifyIdentity, u = id && id.currentUser && id.currentUser();
    return u ? u.jwt() : Promise.reject(new Error('Sessão terminada — volta a entrar'));
  }
  function req(path, opts) {
    return token().then(function (t) {
      opts = opts || {};
      opts.headers = Object.assign({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, opts.headers || {});
      return fetch(BASE + path, opts);
    }).then(function (r) {
      return r.text().then(function (txt) {
        var d = null; try { d = txt ? JSON.parse(txt) : null; } catch (e) { d = { message: txt }; }
        if (!r.ok) { var e = new Error((d && d.message) || ('Erro ' + r.status)); e.status = r.status; throw e; }
        return d;
      });
    });
  }
  // texto UTF-8 <-> base64
  var b64enc = function (str) { return btoa(unescape(encodeURIComponent(str))); };
  var b64dec = function (b64) { return decodeURIComponent(escape(atob(String(b64).replace(/\s/g, '')))); };
  function fileToB64(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1]); };
      r.onerror = function () { rej(new Error('Não foi possível ler o ficheiro')); };
      r.readAsDataURL(file);
    });
  }

  var real = {
    // lista ficheiros de uma pasta (caminho relativo a tenner-site/)
    listar: function (pasta) {
      return req('/contents/' + RAIZ + pasta + '?ref=' + BRANCH).then(function (d) {
        return (Array.isArray(d) ? d : []).filter(function (f) { return f.type === 'file'; }).map(function (f) { return f.name; });
      });
    },
    ler: function (caminho) {
      return req('/contents/' + RAIZ + caminho + '?ref=' + BRANCH).then(function (d) { return b64dec(d.content); });
    },
    lerJSON: function (caminho) { return real.ler(caminho).then(function (t) { return JSON.parse(t); }); },
    // alteracoes: [{ caminho, texto } | { caminho, ficheiro: File } | { caminho, apagar: true }]
    publicar: function (alteracoes, mensagem) {
      var ref, baseTree;
      return req('/git/refs/heads/' + BRANCH).then(function (r) {
        ref = r.object.sha;
        return req('/git/commits/' + ref);
      }).then(function (c) {
        baseTree = c.tree.sha;
        // um blob de cada vez (evita pedidos enormes em paralelo)
        var tree = [];
        return alteracoes.reduce(function (p, a) {
          return p.then(function () {
            var caminho = RAIZ + a.caminho;
            if (a.apagar) { tree.push({ path: caminho, mode: '100644', type: 'blob', sha: null }); return; }
            var conteudo = a.ficheiro ? fileToB64(a.ficheiro) : Promise.resolve(b64enc(a.texto));
            return conteudo.then(function (b64) {
              return req('/git/blobs', { method: 'POST', body: JSON.stringify({ content: b64, encoding: 'base64' }) });
            }).then(function (b) { tree.push({ path: caminho, mode: '100644', type: 'blob', sha: b.sha }); });
          });
        }, Promise.resolve()).then(function () { return tree; });
      }).then(function (tree) {
        return req('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree: tree }) });
      }).then(function (t) {
        return req('/git/commits', { method: 'POST', body: JSON.stringify({ message: mensagem, tree: t.sha, parents: [ref] }) });
      }).then(function (c) {
        return req('/git/refs/heads/' + BRANCH, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
      });
    }
  };

  window.TNGit = window.TN_PREVIEW ? window.TN_PREVIEW_GIT : real;
  window.TNGit.slug = function (s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ficheiro';
  };
})();
