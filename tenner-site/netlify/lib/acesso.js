// Controlo de acesso ao painel (partilhado pelas funções).
// Aprovado = tem o papel "admin" ou "editor" no Netlify Identity.
// Quem cria conta em «Pedir acesso» fica sem papel (pendente) até um administrador aprovar.
// Arranque: se ainda não existir nenhum administrador, a primeira pessoa com sessão fica administradora.
const PAPEIS = ['admin', 'editor'];
const papeis = (u) => (u && u.app_metadata && Array.isArray(u.app_metadata.roles) ? u.app_metadata.roles : []);
const aprovado = (u) => papeis(u).some((r) => PAPEIS.includes(r));
const isAdmin = (u) => papeis(u).includes('admin');

function identityApi(context) {
  const idn = context.clientContext && context.clientContext.identity;
  if (!idn || !idn.url || !idn.token) return null;
  return async (path, method, body) => {
    const r = await fetch(idn.url + path, {
      method: method || 'GET',
      headers: { Authorization: 'Bearer ' + idn.token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const txt = await r.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = { msg: txt }; }
    if (!r.ok) { const err = new Error((data && (data.msg || data.error_description || data.error)) || ('HTTP ' + r.status)); err.status = r.status; throw err; }
    return data;
  };
}
const listar = async (gt) => ((await gt('/admin/users?per_page=500')) || {}).users || [];

// devolve { ok, status, admin, promovido, user, gt }
async function verificar(context) {
  const u = context.clientContext && context.clientContext.user;
  if (!u) return { ok: false, status: 401, erro: 'Sessão necessária' };
  const gt = identityApi(context);
  if (aprovado(u)) return { ok: true, admin: isAdmin(u), user: u, gt };
  if (!gt) return { ok: false, status: 500, erro: 'Netlify Identity indisponível' };
  // o token pode estar desatualizado: confirma no servidor
  const full = await gt('/admin/users/' + u.sub);
  if (aprovado(full)) return { ok: true, admin: isAdmin(full), user: full, gt };
  const todos = await listar(gt);
  if (!todos.some(isAdmin)) {
    const roles = papeis(full).filter((r) => !PAPEIS.includes(r)).concat('admin');
    await gt('/admin/users/' + u.sub, 'PUT', { app_metadata: Object.assign({}, full.app_metadata, { roles }) });
    return { ok: true, admin: true, promovido: true, user: full, gt };
  }
  return { ok: false, status: 403, pendente: true, erro: 'A tua conta aguarda aprovação de um administrador' };
}

module.exports = { verificar, identityApi, listar, papeis, aprovado, isAdmin, PAPEIS };
