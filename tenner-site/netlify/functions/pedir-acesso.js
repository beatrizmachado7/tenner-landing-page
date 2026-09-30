// Pedido de acesso ao painel feito pelo link de convite (tenner10.netlify.app/convite).
// Público: a pessoa só indica o email. O pedido fica no Netlify Blobs (acessos/<id>)
// e aparece no painel em «Convites». Ao aprovar, o Netlify envia-lhe um email para criar a palavra-passe.
const crypto = require('crypto');
const { getStore, connectLambda } = require('../lib/netlify-blobs.cjs');

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITE_POR_HORA = 5;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { erro: 'Método não suportado' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { erro: 'Pedido inválido' }); }
  if (b.empresa_site) return json(200, { ok: true }); // armadilha anti-spam

  const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
  if (!EMAIL.test(email)) return json(400, { erro: 'Escreve um email válido.' });

  connectLambda(event);
  const store = getStore('painel');

  const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || '')).split(',')[0].trim();
  if (ip) {
    const hora = new Date().toISOString().slice(0, 13);
    const chave = 'limites/acesso-' + crypto.createHash('sha256').update(ip + hora).digest('hex').slice(0, 32);
    const n = Number(await store.get(chave)) || 0;
    if (n >= LIMITE_POR_HORA) return json(429, { erro: 'Recebemos vários pedidos seguidos. Tenta de novo daqui a pouco.' });
    await store.set(chave, String(n + 1));
  }

  // não duplica pedidos pendentes do mesmo email
  const id = crypto.createHash('sha256').update(email).digest('hex').slice(0, 24);
  const atual = await store.get('acessos/' + id, { type: 'json' });
  if (atual && atual.estado === 'pendente') return json(200, { ok: true });

  await store.setJSON('acessos/' + id, { id, email, criado: new Date().toISOString(), estado: 'pendente' });
  return json(200, { ok: true });
};
