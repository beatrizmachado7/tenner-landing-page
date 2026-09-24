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
  'arquivo.json': { items: galeria() }
};

// Arquivo: 3 categorias (content/galeria/<categoria>.json), cada uma com a sua lista de imagens.
// No site ("Todos") as categorias aparecem intercaladas para a galeria ficar variada.
function galeria() {
  const cats = ['prematch', 'video', 'social'];
  const lists = cats.map((cat) => {
    const f = path.join(dir, 'galeria', cat + '.json');
    if (!fs.existsSync(f)) return [];
    let data;
    try { data = read(f); } catch (e) { console.warn('[build] ignorado (JSON inválido): galeria/' + cat); return []; }
    return (data.items || []).filter((i) => i && i.image).map((i) => ({ ...i, category: cat }));
  });
  const out = [];
  for (let n = 0; lists.some((l) => n < l.length); n++) {
    lists.forEach((l) => { if (n < l.length) out.push(l[n]); });
  }
  return out;
}

for (const [file, data] of Object.entries(out)) {
  fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2) + '\n');
  const n = (data.items || data.plans || []).length;
  console.log('[build]', file, '→', n, 'itens');
}
