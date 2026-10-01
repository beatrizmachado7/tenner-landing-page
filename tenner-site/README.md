# TENNER. — Landing page

Site estático (HTML + CSS + JS) com painel de administração Decap CMS em `/admin`.

## Como está organizado
- `index.html`, `css/`, `js/`: a página
- `content/site.json`: textos gerais (início, sobre, contacto, introduções)
- `content/galeria/estatico.json` (fotos), `motion.json` (vídeos em autoplay), `carrosseis.json` (carrosséis Instagram): as 3 colunas do Arquivo
- `content/site.json` → `whatsapp`: link do WhatsApp dos botões dos planos (cada plano tem a sua mensagem em `whatsapp_message`)
- `content/planos/`, `content/servicos/`, `content/extras/`: **uma entrada por ficheiro** — é isto que o painel cria e apaga
- `build.js`: junta essas pastas em `content/arquivo.json`, `planos.json`, etc. (gerados; não editar à mão). O Netlify corre-o sozinho a cada publicação.
- `admin/`: painel (config, tema `admin.css`, layout com menu lateral em `shell.css` / `shell.js`, Dashboard em `dash.js`)
- Dashboard: Clientes e Estado dos trabalhos. Clientes/trabalhos ficam no **Netlify Blobs** através da função `netlify/functions/painel.js` — são privados e guardar **não** cria uma nova publicação.
- Colaboradores (`#/colaboradores`): convidar por email, reenviar convite, remover acesso e dar/tirar administrador. Usa `netlify/functions/colaboradores.js` (API de administração do Netlify Identity). Só administradores gerem; se ninguém for administrador, quem abrir a página primeiro fica administrador.
- `images/uploads/`: imagens enviadas pelo painel

## Netlify
- Base directory: `tenner-site` · Build command: vem do `netlify.toml` (`node build.js`) · Publish: `.`
- Identity ativo (Invite only) + Git Gateway ativo.

## Email de convite (Netlify Identity)
- Modelo em `admin/emails/convite.html`. No Netlify: Identity → Emails → Invitation template → caminho `/admin/emails/convite.html`, assunto "Convite para o painel TENNER."

## Planos: orçamentos e renovações
- **Onde se editam os planos:** painel → *Planos e preços* (ficheiros em `content/planos/`). O formulário do site e o painel usam sempre esta lista (via `content/planos.json`). Alterar planos cria uma publicação.
- **Formulário do site:** secção Planos (`#orcamento` em `index.html`, lógica em `js/main.js`). Os botões «Quero o …» levam ao formulário com o plano escolhido.
- **Função `netlify/functions/pedido.js`** (pública): valida, tem anti-spam (campo escondido + limite de 5 pedidos/hora por IP) e guarda cada pedido em Netlify Blobs (`pedidos/<id>`). Não cria publicação.
- **Painel:** cartão «Planos: orçamentos e renovações» (`admin/dash.js`). Aceitar cria/associa a ficha do cliente (procura por telemóvel, email e nome para evitar duplicados) e cria o plano ativo. Recusar fica no histórico.
- **Renovações:** mensais, mantendo o dia de início (31/01 → 28/02 → 31/03). Regras de datas em `admin/datas.js`, sempre no fuso de Portugal. Nada renova nem termina sozinho — só com «Vai continuar» / «Não vai continuar».
- `netlify/functions/painel.js` guarda clientes, trabalhos e planos ativos com controlo de versão (evita que duas pessoas se sobreponham).

## Entrar e pedir acesso
- O ecrã de entrada do painel é da TENNER (`admin/login.js`, em `admin/index.html`): Entrar, Pedir acesso (criar conta), Esqueci-me da palavra-passe, aceitar convite.
- Papéis no Netlify Identity: `admin` (gere colaboradores) e `editor` (usa o painel). Quem pede acesso fica sem papel → ecrã «à espera de aprovação» até um administrador aprovar em Colaboradores.
- As funções verificam o papel (`netlify/lib/acesso.js`, `netlify/functions/sessao.js`). Se ainda não houver administrador, a primeira pessoa a entrar fica administradora.
- Links dos emails (convite/confirmação/recuperação) abrem na página inicial e são reencaminhados para `/admin/`.
- Link de convite para partilhar: `/convite` (reencaminha para `/admin/#/pedir-acesso`, que pede **só o email**). O pedido fica em Netlify Blobs (`acessos/<id>`, função `pedir-acesso.js`) e aparece no painel em **Convites**. «Aprovar» envia o convite do Netlify Identity (email para criar palavra-passe) com papel colaborador; «Recusar» arquiva o pedido.
- Não é preciso abrir o registo no Netlify (Registration fica em *Invite only*).


## Funções sem dependências
- A biblioteca `@netlify/blobs` (MIT) está copiada em `netlify/lib/netlify-blobs.cjs`, por isso o Netlify não precisa de instalar pacotes (`package.json` sem dependências).

## Planos, Arquivo e Perfil (páginas próprias do painel)
- **Planos** (`#/planos`, `admin/conteudo.js`): cartões dos planos; cada plano tem nome, descrição (uma linha por ponto; « — » para o texto pequeno; «OFERTA» para destacar), «Mais pedido», mensagem do WhatsApp e «Mostrar no site». Grava em `content/planos/*.json`.
- **Arquivo** (`#/arquivo`): Pré Match Estático (foto), Motion Vídeos (vídeo) e Social Media (várias fotos, em carrossel). Grava em `content/galeria/*.json` e os ficheiros em `images/uploads/`.
- As alterações acumulam-se e vão num **único commit** ao carregar em «Publicar no site» (`admin/git.js`, via Git Gateway) → uma só publicação no Netlify.
- **Perfil**: carregar no nome no fundo do menu → foto, nome e descrição (guardados na conta do Netlify Identity; não criam publicação).
- Removidos do menu: Pre Match Estático, Motion Videos, Carrosséis (agora em Arquivo), Definições gerais e Imagens e vídeos.
- **O que fazemos** (`#/servicos`) e **Serviços extra** (`#/extras`): cartões com Nome, Descrição e «Mostrar no site»; também dá para criar e apagar. Nos serviços extra, a 1.ª linha da descrição é a frase curta (sempre visível) e o resto é o texto que abre no site. Gravam em `content/servicos/` e `content/extras/`, no mesmo «Publicar no site».
- **Página inicial** (`#/inicio`): edita `content/site.json` em cartões — Topo (frase, slogan, apresentação, 3 imagens ou vídeos — o site mostra vídeo em loop, sem som, se o ficheiro for .mp4/.webm/.mov), Faixa amarela (palavras), Sobre nós, Textos das secções e Contacto. Vai no mesmo «Publicar no site».
- **Novas secções** (`#/seccoes`): «Criar nova secção» com título, subtítulo, etiqueta pequena (opcional), onde aparece no site, cartões opcionais (imagem, título, texto; ordem com setas) e «Mostrar no site». Grava em `content/seccoes/*.json`; `build.js` junta em `content/seccoes.json`; o site mostra-as nos pontos `.cs-slot` de `index.html` (antes/depois de Sobre, depois de Serviços, Planos, Serviços extra ou Arquivo). O cartão «Ordem no site» mostra as secções fixas com as novas pelo meio; as setas mudam `posicao` e `ordem`.
- **WhatsApp dos planos**: número em Página inicial → «Contacto e WhatsApp» (`site.json → whatsapp.link`; 9 dígitos = Portugal, junta 351). Com número, «Quero o …» abre wa.me com a mensagem do plano; sem número, leva ao contacto. O formulário de orçamento foi retirado do site a pedido da Beatriz (a função `pedido.js` fica, sem uso).

## Site em português e inglês

- O botão **PT / EN** no topo do site muda o idioma. A escolha fica guardada no browser e o link `?lang=en` abre o site já em inglês.
- Os textos em inglês estão nos mesmos ficheiros: campos terminados em `_en` (planos, serviços, secções e cartões) e o bloco `en` em `content/site.json`.
- No painel, cada editor tem uma caixa opcional **«Versão em inglês»**. Se um campo em inglês ficar vazio, o site mostra o texto em português.
- Os textos fixos do site (menu, títulos das secções, botões) estão traduzidos em `js/main.js` (objeto `UI`).
