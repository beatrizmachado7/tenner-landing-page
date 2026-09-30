// Dados privados do painel: clientes, trabalhos, planos ativos (renovações) e pedidos de orçamento.
// Ficam no Netlify Blobs: guardar aqui NÃO cria uma nova publicação do site
// e os dados nunca ficam visíveis no site público.
// Só responde a colaboradores aprovados (papel admin/editor no Netlify Identity).
const { getStore, connectLambda } = require('../lib/netlify-blobs.cjs');
const { verificar } = require('../lib/acesso');

const KEY = 'dados';
const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});
const clean = (s, max) => String(s == null ? '' : s).trim().slice(0, max || 200);
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const dia = (s) => (DATA.test(String(s || '')) ? String(s) : '');
const um = (v, lista, def) => (lista.includes(v) ? v : def);

function sanitize(d) {
  const clientes = (Array.isArray(d.clientes) ? d.clientes : []).slice(0, 1000).map((c) => ({
    id: clean(c.id, 40),
    nome: clean(c.nome, 120),
    clube: clean(c.clube, 120),
    plano: clean(c.plano, 60),
    whatsapp: clean(c.whatsapp, 30),
    contacto: clean(c.contacto, 160),
    desde: dia(c.desde)
  })).filter((c) => c.id && c.nome);
  const ids = new Set(clientes.map((c) => c.id));

  const trabalhos = (Array.isArray(d.trabalhos) ? d.trabalhos : []).slice(0, 3000).map((t) => ({
    id: clean(t.id, 40),
    cliente: clean(t.cliente, 40),
    titulo: clean(t.titulo, 160),
    estado: um(t.estado, ['por-comecar', 'em-producao', 'em-revisao', 'entregue'], 'por-comecar'),
    prazo: dia(t.prazo)
  })).filter((t) => t.id && t.titulo && ids.has(t.cliente));

  const assinaturas = (Array.isArray(d.assinaturas) ? d.assinaturas : []).slice(0, 2000).map((a) => ({
    id: clean(a.id, 40),
    cliente: clean(a.cliente, 40),
    plano: clean(a.plano, 60),
    inicio: dia(a.inicio),
    dia: Math.min(31, Math.max(1, parseInt(a.dia, 10) || 1)),
    proxima: dia(a.proxima),
    estado: um(a.estado, ['ativo', 'terminado'], 'ativo'),
    resposta: um(a.resposta, ['', 'aguardar', 'continua', 'nao'], ''),
    mensagem: dia(a.mensagem),
    termina: dia(a.termina),
    pedido: clean(a.pedido, 40),
    historico: (Array.isArray(a.historico) ? a.historico : []).slice(-150).map((h) => ({
      data: dia(h.data), tipo: clean(h.tipo, 30), nota: clean(h.nota, 200)
    }))
  })).filter((a) => a.id && a.plano && a.inicio && a.proxima && ids.has(a.cliente));

  return { clientes, trabalhos, assinaturas };
}

async function lerPedidos(store) {
  const { blobs } = await store.list({ prefix: 'pedidos/' });
  const lista = await Promise.all(blobs.slice(-1000).map((b) => store.get(b.key, { type: 'json' }).catch(() => null)));
  return lista.filter(Boolean).sort((a, b) => String(b.criado).localeCompare(String(a.criado)));
}

exports.handler = async (event, context) => {
  let acesso;
  try { acesso = await verificar(context); } catch (e) { return json(502, { erro: 'Erro no Netlify Identity' }); }
  if (!acesso.ok) return json(acesso.status, { erro: acesso.erro, pendente: !!acesso.pendente });

  connectLambda(event);
  const store = getStore('painel');
  const atual = (await store.get(KEY, { type: 'json' })) || { clientes: [], trabalhos: [], assinaturas: [], rev: 0 };
  atual.rev = Number(atual.rev) || 0;
  if (!Array.isArray(atual.assinaturas)) atual.assinaturas = [];

  if (event.httpMethod === 'GET') {
    return json(200, Object.assign({}, atual, { pedidos: await lerPedidos(store) }));
  }

  if (event.httpMethod === 'PUT') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { erro: 'JSON inválido' }); }

    // controlo de versão: se outra pessoa gravou entretanto, devolve os dados atuais
    if (Number(body.rev) !== atual.rev) {
      return json(409, Object.assign({ erro: 'Os dados foram alterados noutro lado' }, atual, { pedidos: await lerPedidos(store) }));
    }

    // decisões sobre pedidos de orçamento (aceite / recusado)
    const decisoes = (Array.isArray(body.pedidos) ? body.pedidos : []).slice(0, 200);
    for (const p of decisoes) {
      const id = clean(p.id, 40);
      if (!id) continue;
      const key = 'pedidos/' + id;
      const orig = await store.get(key, { type: 'json' });
      if (!orig) continue;
      await store.setJSON(key, Object.assign({}, orig, {
        estado: um(p.estado, ['pendente', 'aceite', 'recusado'], orig.estado),
        cliente: clean(p.cliente, 40),
        assinatura: clean(p.assinatura, 40),
        decidido: dia(p.decidido) || new Date().toISOString().slice(0, 10)
      }));
    }

    const data = Object.assign(sanitize(body), { rev: atual.rev + 1, atualizado: new Date().toISOString() });
    await store.setJSON(KEY, data);
    return json(200, Object.assign({}, data, { pedidos: await lerPedidos(store) }));
  }
  return json(405, { erro: 'Método não suportado' });
};
