# Bar POS Comunidade | Software de Gestão para Associações, Motoclubes, Coletividades e Bares

Aplicação web de gestão para associações, motoclubes, coletividades, clubes recreativos e bares comunitários. Este software funciona como POS para bar, sistema de gestão de stock, gestão de sócios, controlo de cotas e administração de merchandising no mesmo projeto.

Este projeto junta, no mesmo sistema:
- vendas de bar e merchandising
- mesas e contas abertas
- produtos, stock e movimentos
- sócios e pagamento de cotas
- utilizadores com perfis de admin e funcionário
- relatórios operacionais

O objetivo é ser simples de instalar, fácil de usar e acessível para equipas pequenas que precisam de uma ferramenta prática para a rotina da comunidade.

## Software de gestão para comunidade

O Bar POS Comunidade foi pensado para organizações onde a gestão acontece ao balcão, nas mesas, nos eventos, na tesouraria e no contacto diário com sócios e visitantes.

É especialmente útil para:
- motoclubes
- associações locais
- coletividades
- clubes recreativos
- bares de sede
- bancas de merchandising em eventos

Se alguém estiver à procura de um programa para associação, software para motoclube, sistema POS para bar, aplicação para gestão de sócios ou plataforma para controlo de cotas, este projeto foi construído exatamente para esse tipo de realidade.

## Funcionalidades principais do sistema

### POS para bar e ponto de venda
- venda rápida ao balcão
- escolha de método de pagamento
- cálculo de troco em pagamentos a dinheiro
- emissão de recibo

### Mesas
- abertura de conta por mesa
- adicionar e alterar produtos
- fechar mesa com pagamento
- cancelar mesa quando necessário

### Gestão de stock e produtos
- gestão de produtos de bar e merchandising
- categorias por área
- imagens dos produtos
- controlo de stock baixo
- histórico de movimentos

### Gestão de sócios e cotas
- registo de sócios
- consulta por número e nome
- pagamento de cotas por ano
- histórico e cancelamento de pagamentos

### Administração e configuração
- utilizadores e permissões
- configuração da marca
- PIN de cancelamento
- valor base das cotas
- idioma da aplicação

## Palavras-chave relevantes

Este repositório pode ser útil para quem pesquisa por:
- software de gestão para associação
- software para motoclube
- programa para coletividade
- POS para bar
- sistema de gestão de bar
- gestão de stock para bar
- gestão de sócios
- gestão de cotas
- software de merchandising
- aplicação para clube recreativo

## Stack

- Node.js
- Express
- EJS
- MariaDB
- Docker Compose

## Como instalar o software

### 1. Clonar o projeto de gestão

```bash
git clone <repo> bar-pos-comunidade
cd bar-pos-comunidade
```

### 2. Criar o ficheiro de ambiente

```bash
cp .env.example .env
```

Se quiser, pode editar as portas e credenciais no `.env` antes de arrancar.

### 3. Iniciar o sistema com Docker

Opção recomendada:

```bash
docker compose -f docker-compose.yaml up -d --build --remove-orphans
```

Alternativa:

```bash
docker compose -f docker-compose.yml up -d --build --remove-orphans
```

### 4. Abrir a aplicação no browser

- Aplicação: `http://localhost:8080`
- phpMyAdmin: `http://localhost:8081`

### 5. Parar os serviços

```bash
docker compose -f docker-compose.yaml down
```

## Login inicial

Para facilitar testes e primeiros passos:

- Admin: `admin@bar.local` / `admin123`
- Funcionário: `funcionario@bar.local` / `funcionario123`

## Instalação do Docker no Ubuntu para correr a aplicação

Se ainda não tiver Docker:

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

Verificação:

```bash
sudo docker version
sudo docker compose version
```

Opcional, para usar Docker sem `sudo`:

```bash
sudo usermod -aG docker $USER
```

Depois termine a sessão e volte a entrar.

## Estrutura do projeto

```text
.
├─ src/
│  ├─ server.js
│  ├─ db.js
│  ├─ i18n.js
│  └─ views/
├─ public/
│  ├─ css/
│  └─ js/
├─ scripts/init-db.js
├─ migrations/
├─ docker-compose.yaml
├─ docker-compose.yml
├─ Dockerfile
└─ package.json
```

## Dados, base de dados e configuração

O sistema usa:
- MariaDB para os dados
- sessões guardadas em base de dados
- uploads persistidos em volume Docker
- configuração de marca guardada no servidor

Variáveis principais no `.env`:
- `APP_PUBLIC_PORT`
- `SESSION_SECRET`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_PUBLIC_PORT`
- `PHPMYADMIN_PUBLIC_PORT`
- `UPLOAD_DIR`
- `ADMIN_CANCEL_PIN`

## Comandos úteis

Ver logs:

```bash
docker compose -f docker-compose.yaml logs -f app
```

Parar tudo:

```bash
docker compose -f docker-compose.yaml down
```

Apagar volumes e recomeçar do zero:

```bash
docker compose -f docker-compose.yaml down -v
```

Executar testes:

```bash
npm test
```

## Segurança da aplicação

O projeto já inclui uma base de segurança importante para uso real:
- passwords com hash
- sessões seguras com `httpOnly`
- permissões separadas entre admin e funcionário
- PIN para cancelamentos
- proteção base com `helmet`
- validação de uploads de imagem

## Projeto open source para a comunidade

Este repositório foi desenhado para ser útil no terreno e ao mesmo tempo fácil de manter.

Ainda assim, há espaço para a comunidade melhorar:
- documentação
- testes
- traduções
- acessibilidade
- relatórios
- integração com impressoras
- melhorias de interface para eventos e uso móvel

## Como contribuir para o software

Se quiser ajudar, pode contribuir de várias formas:
- reportar bugs
- sugerir melhorias
- melhorar textos e tradução
- rever fluxos de uso real no bar ou na associação
- implementar novas funcionalidades

Ao contribuir, tente manter o foco em:
- simplicidade
- estabilidade
- clareza para utilizadores não técnicos
- boa experiência em dispositivos táteis

## Resumo do projeto

O Bar POS Comunidade não é só um POS. É um software de gestão comunitária para bar, stock, sócios, cotas e merchandising, criado para equipas pequenas que precisam de uma solução prática, simples e colaborativa.
