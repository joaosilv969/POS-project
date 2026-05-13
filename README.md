# Bar POS / Motoclube (Node + Express + MariaDB)

Aplicação web (backend + frontend) para gestão de:
- Vendas de bar e merchandising (POS rápido)
- Mesas e contas abertas
- Produtos, stock, movimentos e imagens
- Sócios e pagamentos de cotas
- Utilizadores (admin/funcionário), permissões e relatórios

O projeto é intencionalmente simples: a maior parte da lógica está concentrada em `src/server.js` (rotas + queries), com EJS para as views.

## Instalação no Ubuntu

### 1) Instalar Docker Engine

No Ubuntu 22.04 / 24.04, execute:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 2) Verificar a instalação

```bash
sudo docker version
sudo docker compose version
```

### 3) Usar Docker sem sudo (opcional)

```bash
sudo usermod -aG docker $USER
```

Depois encerrar sessão e voltar a entrar para que o grupo `docker` seja aplicado.

## Como correr o projeto

### 1) Clonar / preparar o repositório

```bash
git clone <repo> your-project
cd your-project
```

### 2) Criar `.env`

```bash
cp .env.example .env
```

Edite `.env` se quiser alterar portas, credenciais ou configurações de volume.

### 3) Subir os serviços com Docker Compose

O Compose recomendado usa `docker-compose.yaml` com volumes nomeados:

```bash
docker compose -f docker-compose.yaml up -d --build --remove-orphans
```

Se preferir, também pode usar `docker-compose.yml` diretamente:

```bash
docker compose -f docker-compose.yml up -d --build --remove-orphans
```

### 4) Acessar a aplicação

- App: `http://localhost:8080`
- phpMyAdmin: `http://localhost:8081`

### 5) Parar e remover containers

```bash
docker compose -f docker-compose.yaml down
```

## Acessos iniciais (seed)

- Admin: `admin@bar.local` / `admin123`
- Funcionário: `funcionario@bar.local` / `funcionario123`

---

## Stack

- Node.js + Express
- Views: EJS (`src/views/`)
- Assets: CSS/JS em `public/`
- MariaDB (MySQL)
- Sessões: `express-session` + `express-mysql-session`
- Uploads: `multer` (persistidos num volume)
- Docker Compose (modo recomendado)

## Variáveis de ambiente (.env)

O Docker injecta estas variáveis (ver `docker-compose.yaml` e `.env.example`):

- `NODE_ENV`: `production` por omissão
- `APP_PUBLIC_PORT`: porta pública do host (default `8080`)
- `APP_PORT`: porta interna do container (fixa `3000`)
- `SESSION_SECRET`: segredo de sessão (obrigatório em produção)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `DB_PUBLIC_PORT`: porta pública do host para MariaDB (default `3306`)
- `PHPMYADMIN_PUBLIC_PORT`: porta pública (default `8081`)
- `UPLOAD_DIR`: diretório de uploads dentro do container
- `ADMIN_CANCEL_PIN` (opcional): PIN numérico 4–10 dígitos para cancelamentos

### PIN de admin para cancelamentos

- Se `ADMIN_CANCEL_PIN` não estiver definido, o sistema aceita a **password do admin** como “PIN” (compatibilidade).
- Se estiver definido, o seed grava o hash do PIN em `users.cancel_pin_hash` (ver `scripts/init-db.js`).

## Estrutura do projeto

```text
.
├─ src/
│  ├─ server.js            # Express app (rotas + lógica + queries)
│  ├─ db.js                # pool mysql2/promise
│  └─ views/               # EJS (layouts, páginas e partials)
├─ public/
│  ├─ css/app.css          # estilos
│  └─ js/                  # JS do browser (POS, mesas, etc.)
├─ scripts/init-db.js      # aplica migrações + seed inicial
├─ migrations/*.sql        # esquema + evolução da BD
├─ docker-compose.yaml     # Compose com volumes nomeados (recomendado)
├─ docker-compose.yml      # Variante com paths fixos (host volumes)
├─ Dockerfile              # build da app (node:20-alpine)
└─ package.json            # scripts npm
```

## Visão geral do runtime

### Inicialização

- O container executa `npm start` (ver `Dockerfile` e `package.json`).
- `npm start` corre:
  1) `node scripts/init-db.js` (migrações + seeds)
  2) `node src/server.js` (servidor web)

### Base de dados

`scripts/init-db.js`:
- liga à MariaDB com retry (útil no arranque do Docker)
- aplica **todas** as migrações SQL em `migrations/` por ordem de nome
- faz seed idempotente: métodos de pagamento, mesas, categorias, utilizadores e produtos

Conexões no backend:
- `src/db.js` cria um `pool` (`mysql2/promise`) com `decimalNumbers: true` e `timezone: "Z"`
- o backend usa `pool.execute(...)` para queries e `pool.getConnection()` para transações (ex.: mesas e cancelamentos)

## Modelo de dados (tabelas principais)

As migrações vivem em `migrations/`.

### Core POS / Stock

- `users`: utilizadores (admin/employee), `password_hash`, `cancel_pin_hash`
- `categories`: categorias (`scope`: `bar` ou `merchandising`)
- `products`: artigos, com `stock`, `low_stock_threshold`, `available_for_sale`, `deleted_at`
- `product_images`: imagem primária por produto (1 registo com `is_primary=1`)
- `payment_methods`: métodos (ex.: `cash`, `mbway`, `card`)

Vendas:
- `sales`: cabeçalho da venda (recibo, total, método, opcionalmente mesa/sócio, `status`)
- `sale_items`: linhas da venda (produto opcional, nome, qty, total)
- `stock_movements`: histórico de stock (entrada, venda, ajuste manual, desperdício)

Mesas:
- `bar_tables`: mesas configuradas
- `table_orders`: conta aberta por mesa (`open/closed/cancelled`)
- `table_order_items`: itens na conta (qty, preço unitário)

### Sócios / Cotas

- `members`: sócios (número, nome, ativo)
- `member_dues_payments`: pagamentos de cotas por ano (com `status` e cancelamento)
- `dues_years`: valor de quota por ano (override ao valor default)

## Frontend (views e JS)

### EJS

- Layout principal: `src/views/layout.ejs`
- Layout de autenticação: `src/views/auth-layout.ejs`
- Páginas: `src/views/**`
- Flash messages: `src/views/partials/flash.ejs` (guardadas em `req.session.flash`)

### JavaScript do browser

- `public/js/app.js`: confirmações (`data-confirm`), preview de imagem e UI da sidebar
- `public/js/pos.js`: carrinho do POS, cálculo de troco (dinheiro), validação de stock client-side
- `public/js/tables.js`: interações em mesas (adicionar/editar itens via fetch)
- `public/js/merch.js`: interações em merchandising (quando aplicável)
- `public/js/virtual-keyboard.js`: teclado numérico (POS/cash input)

## Rotas e módulos (visão por áreas)

As rotas estão todas em `src/server.js`. Abaixo fica uma leitura “por módulos”, para orientar a manutenção.

### Autenticação e permissões

- Sessões em MariaDB (store do `express-mysql-session`)
- Middlewares:
  - `requireAuth`: obriga login
  - `requireAdmin`: obriga role `admin`
- Rotas:
  - `GET /login`, `POST /login`, `POST /logout`

### Configurações / Branding

Config persistida como JSON em `UPLOAD_DIR/brand-config.json`:
- nome/subtítulo da app
- prefixos de recibo (bar/merch)
- threshold default de stock baixo
- valor default de cotas
- logomarca (“brand mark”) em uploads

Rotas:
- `GET /settings` (admin)
- `POST /settings/app`
- `POST /settings/brand-mark` (upload)
- `GET /brand-mark` (serve imagem)

### Produtos, categorias e imagens

Produtos têm `product_type`:
- `bar` (consumo no bar)
- `merchandising` (artigos com `size`)

Pontos importantes:
- Upload de imagem com `multer` e validação de mimetype (`jpg/jpeg/png/webp`)
- Soft-delete: `products.deleted_at` em vez de apagar registos
- Alterações manuais de stock geram `stock_movements` (tipo `manual_adjustment`)

Rotas (resumo):
- listagens e formulários de produtos (admin)
- criação/edição/remoção lógica de produtos (admin)
- categorias por scope (`/categories/bar` e `/categories/merchandising`)

### POS (venda direta)

Fluxo típico:
1) escolher produtos (UI client-side em `public/js/pos.js`)
2) selecionar método de pagamento (dinheiro ativa secção de troco)
3) finalizar: backend valida stock, cria `sales` + `sale_items`, baixa stock e regista `stock_movements`
4) imprime/mostra recibo

### Mesas (contas abertas)

Fluxo típico:
- abrir mesa → cria `table_orders` com `status=open`
- adicionar/alterar itens → `table_order_items` (valida stock em transação)
- fechar mesa → cria venda em `sales`/`sale_items`, baixa stock, fecha `table_orders`
- cancelar mesa → marca `status=cancelled`

As operações de mesa usam transações + `FOR UPDATE` para evitar inconsistências de stock.

### Vendas, histórico e cancelamentos

- `GET /sales/:id`: detalhe/recibo
- `POST /sales/:id/cancel`: cancela venda (requer PIN de admin)
  - repõe stock (incrementa `products.stock`)
  - regista movimento em `stock_movements`
  - marca `sales.status='cancelled'`

### Sócios e cotas

Registo de sócios (`members`) e pagamentos (`member_dues_payments`) por ano.

Valor da quota:
- se existir registo em `dues_years` para o ano, usa esse valor
- senão usa `duesDefaultAmount` (config em `brand-config.json`)

Relatório de cotas:
- `GET /reports/dues?year=YYYY&start_date=...&end_date=...`

### Relatórios

Há relatórios “gerais” e específicos:
- `GET /reports` (agregados de vendas e stock baixo)
- `GET /reports/merchandising`
- `GET /reports/dues`
- `GET /cash-summary` (resumo de caixa por dinheiro/outros)

## Segurança (resumo)

- Headers via `helmet` + CSP restritiva (scripts/styles self)
- Sessões httpOnly + sameSite lax (secure se `NODE_ENV=production` e `FORCE_HTTPS=true`)
- Passwords com `bcryptjs`
- Cancelamentos protegidos com PIN/hash (`users.cancel_pin_hash`)

## Comandos úteis

Logs:
```bash
docker compose -f docker-compose.yaml logs -f app
```

Parar:
```bash
docker compose -f docker-compose.yaml down
```

Reset total (apaga BD + uploads):
```bash
docker compose -f docker-compose.yaml down -v
```

## Troubleshooting rápido

- “Tabela/coluna não existe”: confirme que `scripts/init-db.js` está a correr no arranque e que as migrações em `migrations/` estão na pasta certa.
- “Uploads não aparecem”: verifique o volume de `uploads` (`UPLOAD_DIR`) e permissões do host (se usar `docker-compose.yml` com paths fixos).
- “Sessões não guardam”: confirme `SESSION_SECRET` e acesso da app à MariaDB; as tabelas do store são criadas automaticamente pelo `express-mysql-session`.
- Login seguro
- Passwords com hash
- Validação dos uploads de imagens
- Limitar tipos de ficheiros permitidos: jpg, jpeg, png, webp
- Impedir upload de ficheiros perigosos
- Proteção básica contra SQL injection e XSS
- Separação de permissões entre admin, funcionário e cliente

11. Interface
Quero uma interface simples, moderna e responsiva.
Deve funcionar bem em desktop e telemóvel.
O painel de administração deve ser fácil de usar.

12. O que quero que entregues
Entrega-me:
- Estrutura completa do projeto
- Código completo dos ficheiros principais
- Dockerfile
- docker-compose.yml
- Exemplo de ficheiro .env
- Script ou migrations para criar a base de dados
- Instruções passo a passo para correr o projeto
- Utilizador admin inicial para testes
