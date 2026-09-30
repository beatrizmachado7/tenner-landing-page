// Estado da sessão no painel: aprovado / pendente / administrador.
const { verificar } = require('../lib/acesso');
const json = (s, b) => ({ statusCode: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(b) });

exports.handler = async (event, context) => {
  try {
    const v = await verificar(context);
    if (v.status === 401) return json(401, { erro: v.erro });
    return json(200, { aprovado: !!v.ok, pendente: !!v.pendente, admin: !!v.admin, promovido: !!v.promovido });
  } catch (e) {
    return json(502, { erro: e.message || 'Erro no Netlify Identity' });
  }
};
