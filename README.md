# TENNER. — Landing page

Site estático (HTML + CSS + JS) com painel de administração Decap CMS em `/admin`.

## Como está organizado
- `index.html`, `css/`, `js/`: a página
- `content/site.json`: textos gerais (início, sobre, contacto, introduções)
- `content/galeria/estatico.json` (fotos), `motion.json` (vídeos em autoplay), `carrosseis.json` (carrosséis Instagram): as 3 colunas do Arquivo
- `content/site.json` → `whatsapp`: link do WhatsApp dos botões dos planos (cada plano tem a sua mensagem em `whatsapp_message`)
- `content/planos/`, `content/servicos/`, `content/extras/`: **uma entrada por ficheiro** — é isto que o painel cria e apaga
- `build.js`: junta essas pastas em `content/arquivo.json`, `planos.json`, etc. (gerados; não editar à mão). O Netlify corre-o sozinho a cada publicação.
- `admin/`: painel (config, tema `admin.css`)
- `images/uploads/`: imagens enviadas pelo painel

## Netlify
- Base directory: `tenner-site` · Build command: vem do `netlify.toml` (`node build.js`) · Publish: `.`
- Identity ativo (Invite only) + Git Gateway ativo.
