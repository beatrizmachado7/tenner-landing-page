# TENNER. — Landing page

Site estático (HTML + CSS + JS) com painel de administração Decap CMS.

- `index.html`, `css/`, `js/`: a página
- `content/*.json`: todos os textos, preços e o arquivo (é isto que o painel edita)
- `images/`: imagens; o que for enviado pelo painel vai para `images/uploads/`
- `admin/`: painel em `/admin` (login por Netlify Identity)

## Publicar no Netlify
1. Netlify → Add new site → Import from GitHub → escolher este repositório (sem build command, publish directory `.`).
2. Site configuration → Identity → Enable Identity.
3. Identity → Registration → **Invite only**; depois Invite users (o email de quem vai gerir).
4. Identity → Services → **Enable Git Gateway**.
5. Abrir `https://<site>/admin/`, aceitar o convite e definir a password.

## Testar no computador
```
npx decap-server        # num terminal
npx serve .             # noutro terminal, depois abrir /admin/
```
