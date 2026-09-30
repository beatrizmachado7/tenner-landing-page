// Colaboradores do painel (Netlify Identity).
// Listar, convidar por email, aprovar pedidos de acesso, remover e mudar o papel (administrador / colaborador).
// Papéis: "admin" (gere colaboradores) e "editor" (usa o painel). Sem papel = pedido de acesso pendente.
// Só administradores podem alterar; colaboradores aprovados veem a lista.
const { verificar, listar, papeis, isAdmin, PAPEIS } = require('../lib/acesso');

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const comPapel = (u, papel) => Object.assign({}, u.app_metadata, {
  roles: papeis(u).filter((r) => !PAPEIS.includes(r)).concat(papel ? [papel] : [])
});

function view(u) {
  const roles = papeis(u);
  const papel = roles.includes('admin') ? 'admin' : roles.includes('editor') ? 'editor' : '';
  let estado;
  if (!papel) estado = 'aprovacao';                          // pediu acesso, falta aprovar
  else if (u.invited_at && !u.confirmed_at) estado = 'convite'; // convidado, ainda não aceitou
  else estado = 'ativo';
  return {
    id: u.id,
    email: u.email,
    nome: (u.user_metadata && u.user_metadata.full_name) || '',
    admin: papel === 'admin',
    papel,
    estado,
    emailConfirmado: !!u.confirmed_at,
    convidado: u.invited_at || u.created_at || null,
    ultimo: u.last_sign_in_at || null
  };
}
const ordem = { aprovacao: 0, ativo: 1, convite: 2 };

exports.handler = async (event, context) => {
  let v;
  try { v = await verificar(context); } catch (e) { return json(502, { erro: 'Erro no Netlify Identity' }); }
  if (!v.ok) return json(v.status, { erro: v.erro, pendente: !!v.pendente });
  const gt = v.gt;
  if (!gt) return json(500, { erro: 'Netlify Identity indisponível' });
  const eu = context.clientContext.user.sub;

  try {
    let users = await listar(gt);
    const resposta = (msg) => json(200, {
      eu, admin: !!v.admin, promovido: !!v.promovido, msg: msg || '',
      pessoas: users.map(view).sort((a, b) => (ordem[a.estado] - ordem[b.estado]) || (b.admin - a.admin) || a.email.localeCompare(b.email))
    });

    if (event.httpMethod === 'GET') return resposta();
    if (!v.admin) return json(403, { erro: 'Só administradores podem gerir colaboradores' });

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { erro: 'Pedido inválido' }); }

    if (event.httpMethod === 'POST') { // convidar (ou reenviar convite pendente)
      const email = String(body.email || '').trim().toLowerCase();
      if (!EMAIL.test(email)) return json(400, { erro: 'Email inválido' });
      const existe = users.find((u) => (u.email || '').toLowerCase() === email);
      if (existe && !(body.reenviar && existe.invited_at && !existe.confirmed_at)) {
        return json(409, { erro: view(existe).estado === 'aprovacao' ? 'Essa pessoa já te enviou um convite — basta aprovar em Convites' : 'Esse email já tem acesso ou um convite pendente' });
      }
      const papel = body.admin || (existe && isAdmin(existe)) ? 'admin' : 'editor';
      if (existe) await gt('/admin/users/' + existe.id, 'DELETE');
      await gt('/invite', 'POST', { email });
      users = await listar(gt);
      const nu = users.find((u) => (u.email || '').toLowerCase() === email);
      if (nu) { await gt('/admin/users/' + nu.id, 'PUT', { app_metadata: comPapel(nu, papel) }); users = await listar(gt); }
      return resposta((existe ? 'Convite reenviado para ' : 'Convite enviado para ') + email);
    }

    const alvo = users.find((u) => u.id === body.id);
    if (!alvo) return json(404, { erro: 'Colaborador não encontrado' });
    if (alvo.id === eu) return json(400, { erro: 'Não podes alterar a tua própria conta aqui' });

    if (event.httpMethod === 'PUT') { // aprovar pedido / mudar papel
      const papel = body.papel === 'admin' ? 'admin' : 'editor';
      const antes = view(alvo);
      await gt('/admin/users/' + alvo.id, 'PUT', { app_metadata: comPapel(alvo, papel) });
      users = await listar(gt);
      if (antes.estado === 'aprovacao') return resposta('Convite de ' + alvo.email + ' aprovado');
      return resposta(papel === 'admin' ? alvo.email + ' é agora administrador' : alvo.email + ' é agora colaborador');
    }
    if (event.httpMethod === 'DELETE') { // remover acesso / recusar pedido
      const antes = view(alvo);
      await gt('/admin/users/' + alvo.id, 'DELETE');
      users = await listar(gt);
      return resposta(antes.estado === 'aprovacao' ? 'Convite de ' + alvo.email + ' recusado' : 'Acesso de ' + alvo.email + ' removido');
    }
    return json(405, { erro: 'Método não suportado' });
  } catch (e) {
    return json(e.status && e.status < 500 ? e.status : 502, { erro: e.message || 'Erro no Netlify Identity' });
  }
};
