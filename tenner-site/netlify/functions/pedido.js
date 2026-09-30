// Pedidos de orçamento enviados pelo formulário da secção "Planos" do site.
// Público (não precisa de sessão). Cada pedido fica guardado no Netlify Blobs
// como uma entrada própria (pedidos/<id>) — não cria nenhuma publicação do site.
// O painel lê estes pedidos no cartão «Planos: orçamentos e renovações».
const crypto = require('crypto');
const { getStore, connectLambda } = require('../lib/netlify-blobs.cjs');

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});
const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITE_POR_HORA = 5;

async function planosDoSite() {
  // Os planos válidos são os publicados em content/planos.json (geridos no painel → Planos e preços)
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) return null;
  try {
    const r = await fetch(base + '/content/planos.json', { headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.plans || []).map((p) => (p.name + (p.suffix ? ' ' + p.suffix : '')).trim());
  } catch (e) { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { erro: 'Método não suportado' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { erro: 'Pedido inválido' }); }

  // armadilha anti-spam: campo escondido que as pessoas não preenchem
  if (b.empresa_site) return json(200, { ok: true });

  const pedido = {
    nome: clean(b.nome, 120),
    telefone: clean(b.telefone, 30),
    email: clean(b.email, 160).toLowerCase(),
    plano: clean(b.plano, 60),
    mensagem: String(b.mensagem == null ? '' : b.mensagem).trim().slice(0, 1500)
  };
  if (pedido.nome.length < 2) return json(400, { erro: 'Indica o teu nome.' });
  const digitos = pedido.telefone.replace(/\D/g, '');
  if (digitos.length < 9 || digitos.length > 15) return json(400, { erro: 'Indica um número de telemóvel válido.' });
  if (pedido.email && !EMAIL.test(pedido.email)) return json(400, { erro: 'O email não parece válido.' });

  const planos = await planosDoSite();
  if (planos && planos.length && !planos.includes(pedido.plano)) return json(400, { erro: 'Escolhe um dos planos disponíveis.' });
  if (!pedido.plano) return json(400, { erro: 'Escolhe um plano.' });

  connectLambda(event);
  const store = getStore('painel');

  // limite simples por IP (evita envios em massa)
  const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || '')).split(',')[0].trim();
  if (ip) {
    const hora = new Date().toISOString().slice(0, 13);
    const chave = 'limites/' + crypto.createHash('sha256').update(ip + hora).digest('hex').slice(0, 32);
    const n = Number(await store.get(chave)) || 0;
    if (n >= LIMITE_POR_HORA) return json(429, { erro: 'Recebemos vários pedidos seguidos. Tenta de novo daqui a pouco ou fala connosco por email.' });
    await store.set(chave, String(n + 1));
  }

  const id = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  await store.setJSON('pedidos/' + id, Object.assign({ id }, pedido, { criado: new Date().toISOString(), estado: 'pendente' }));
  return json(200, { ok: true });
};
