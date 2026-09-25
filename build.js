// Junta as entradas do painel (uma por ficheiro) nos JSON que a página lê.
// Corre no Netlify a cada publicação: `node build.js`. Sem dependências.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'content');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

function folder(name) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try { return read(path.join(p, f)); }
      catch (e) { console.warn('[build] ignorado (JSON inválido):', name + '/' + f); return null; }
    })
    .filter((x) => x && x.visivel !== false)
    .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0))
    .map(({ ordem, visivel, ...rest }) => rest);
}

const site = read(path.join(dir, 'site.json'));
const out = {
  'servicos.json': { intro: site.servicos_intro || '', items: folder('servicos') },
  'extras.json': { intro: site.extras_intro || '', items: folder('extras') },
  'planos.json': {
    plans: folder('planos').map(({ price, price_note, season_discount, ...p }) => ({ ...p, features: p.features || [] }))
  },
  'arquivo.json': galeria()
};

// Arquivo: 3 colunas (content/galeria/estatico.json, motion.json, carrosseis.json).
function galeria() {
  const col = (name, fallback, keep) => {
    const f = path.join(dir, 'galeria', name + '.json');
    let data = {};
    if (fs.existsSync(f)) {
      try { data = read(f); } catch (e) { console.warn('[build] ignorado (JSON inválido): galeria/' + name); }
    }
    return { title: data.title || fallback, items: (data.items || []).filter((i) => i && i.ativo !== false && keep(i)).map(({ ativo, ...i }) => i) };
  };
  const social = col('carrosseis', 'Conteúdos Social Media', (i) => Array.isArray(i.images));
  social.items = social.items
    .map((c) => ({ ...c, images: c.images.map((x) => (x && typeof x === 'object' ? x.image : x)).filter(Boolean) }))
    .filter((c) => c.images.length);
  const cols = {
    estatico: col('estatico', 'Pre Match Estático', (i) => i.image),
    motion: col('motion', 'Pre Match Motion Videos', (i) => i.video),
    social
  };
  return cols;
}

for (const [file, data] of Object.entries(out)) {
  fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2) + '\n');
  const n = data.estatico
    ? data.estatico.items.length + data.motion.items.length + data.social.items.length
    : (data.items || data.plans || []).length;
  console.log('[build]', file, '→', n, 'itens');
}
