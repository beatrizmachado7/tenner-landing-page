# TENNER. — Landing page

Site estático (HTML + CSS + JS) com painel de administração Decap CMS em `/admin`.

## Como está organizado
- `index.html`, `css/`, `js/`: a página
- `content/site.json`: textos gerais (início, sobre, contacto, introduções)
- `content/galeria/estatico.json` (fotos), `motion.json` (vídeos em autoplay), `carrosseis.json` (carrosséis Instagram): as 3 colunas do Arquivo
- `content/site.json` → `whatsapp`: link do WhatsApp dos botões dos planos (cada plano tem a sua mensagem em `whatsapp_message`)
- `content/planos/`, `content/servicos/`, `content/extras/`: **uma entrada por ficheiro** — é isto que o painel cria e apaga
- `build.js`: junta essas pastas em `content/arquivo.json`, `planos.json`, etc. (gerados; não editar à mão). O Netlify corre-o sozinho a cada publicação.
- `admin/`: painel (config, tema `admin.css`, layout com menu lateral e Dashboard em `shell.css` / `shell.js`)
- `images/uploads/`: imagens enviadas pelo painel

## Netlify
- Base directory: `tenner-site` · Build command: vem do `netlify.toml` (`node build.js`) · Publish: `.`
- Identity ativo (Invite only) + Git Gateway ativo.

## Dashboard de gestão (painel → Dashboard)
- Seguidores do Instagram, aprovações, entregas, projetos e jogos são editados no próprio Dashboard.
- Ficam guardados em `painel-dados/*.json` na raiz do repositório (fora de `tenner-site/`, por isso não são publicados no site), através do Git Gateway do Netlify. Cada gravação é um commit com `[skip ci]` (não gera nova publicação).
- Visitas: o Dashboard lê `/.netlify/functions/visitas` (`{"dias":[{"data":"AAAA-MM-DD","visitas":N}]}`). Sem essa fonte mostra "Dados ainda não disponíveis".
