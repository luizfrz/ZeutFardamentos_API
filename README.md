# Zeut · Gestão de Encomendas — API

API REST em NestJS 12 (prefixo `/api`) com PostgreSQL via Prisma 7.
O front-end fica em outro projeto: `../zeut_gestão` (Next.js).

## Rodar

```bash
cp .env.example .env        # DATABASE_URL, PORT, WEB_ORIGIN
yarn install               # também gera o cliente Prisma (postinstall)
docker compose up -d        # PostgreSQL 16 com volume persistente
yarn db:deploy          # aplica as migrations
yarn start:dev          # http://localhost:3333/api
```

Na primeira subida (tabelas vazias) a API cria o catálogo inicial de grades de tamanho e moldes; depois disso o catálogo é seu — um molde excluído não volta no reinício.
Nada além disso é pré-cadastrado.

## Endpoints

`GET/POST /orders` · `GET /orders/summary` · `GET/PATCH /orders/:id` · `PATCH /orders/:id/status`
`GET/POST /clients` · `GET/POST /responsibles` · `GET/POST /molds` · `DELETE /molds/:id` · `GET /size-grids`

## Regras

- **Prioridade**: menos de 7 dias → URGENTE (≥ 50 peças) ou ALTA · 7–14 dias → MÉDIA · mais de 14 → BAIXA (`src/common/priority.ts`).
- **Data de entrega**: data inexistente é recusada; data passada só é aceita com `allowPastDate: true`
  (na edição, só se a data foi alterada).
- **Molde**: só pode ser excluído se nunca foi usado em pedido e não tem variações (409 com mensagem explicando).
- **Cliente**: CPF/CNPJ válido e único, ao menos uma forma de contato.
- **Responsável**: nome, CPF válido e único e telefone com DDD obrigatórios.
- **Dados preservados**: pedido referencia cliente e responsável com `ON DELETE RESTRICT` — concluir ou alterar um
  pedido nunca remove o cliente, e o banco impede apagar um cliente que já tem pedido.

## Estrutura

```
src/
├── main.ts                   bootstrap (prefixo /api, CORS)
├── app.module.ts
├── common/                   tipos de domínio, validação de CPF/CNPJ/telefone, regra de prioridade, mappers
├── prisma/                   PrismaService (global) e catálogo inicial (grades/moldes)
├── generated/prisma/         cliente gerado (não versionado)
└── modules/
    ├── orders/               controller · service · module
    ├── clients/
    ├── responsibles/
    └── molds/                moldes e grades de tamanho
prisma/                       schema.prisma + migrations
```

Scripts de banco: `db:migrate` (dev), `db:deploy`, `db:studio`, `db:reset`.

## Deploy na Vercel

A API roda na Vercel como **uma função serverless** (`api/index.js` → `dist/serverless.js`), configurada em `vercel.json`
(framework *Other*, `buildCommand: yarn build`, região `gru1`, todas as rotas reescritas para a função). O Nest é iniciado uma vez
por instância e reaproveitado. O banco precisa ser um PostgreSQL externo — o container local não existe lá.

1. **Banco (Neon)**: no painel da Vercel, *Storage → Neon (Marketplace)*, ou em neon.com → *New Project* (região próxima de você,
   ex.: *São Paulo*). Em *Connect* copie **duas** URLs: a **com pooler** (host com `-pooler`) e a **direta**.
   Antes de ir para a Vercel, confirme que as duas funcionam e crie o schema, direto da sua máquina:
   ```bash
   DATABASE_URL='<url com pooler>' DIRECT_DATABASE_URL='<url direta>' yarn db:check   # testa a conexão (não imprime senha)
   DIRECT_DATABASE_URL='<url direta>' yarn db:deploy                                  # cria as tabelas
   ```
   No plano gratuito o Neon suspende o banco quando ocioso: o primeiro acesso depois de um tempo pode levar alguns segundos.
2. **Projeto**: *Add New → Project* → importe este repositório (preset *NestJS*, detectado sozinho).
3. **Não sobrescreva** *Build Command*, *Output Directory* nem *Install Command* no painel: o `vercel.json` já define tudo.
   As migrations **não** rodam no build — veja o passo 1 (`yarn db:migrate:neon` da sua máquina, a cada migration nova).
4. **Variáveis de ambiente**:
   - `DATABASE_URL` = URL com pooler (`?sslmode=require`)
   - `DIRECT_DATABASE_URL` = URL direta (só para as migrations)
   - `WEB_ORIGIN` = URL do front (várias separadas por vírgula)
   - `DB_POOL_MAX` = `5` (opcional)
5. **Conferir**: `https://SEU-PROJETO-API.vercel.app/api/ping` (não usa banco) deve responder `{"ok":true,…}` e
   `/api/health` deve responder `{"status":"ok"}`. Se o banco falhar, `/api/health` devolve 503 com `reason` (`DATABASE_URL_MISSING`,
   `DB_AUTH_FAILED`, `DB_UNREACHABLE`) e o log da função mostra a causa.

**Usando Supabase em vez do Neon** (também é só um PostgreSQL para a API; o NestJS continua rodando na Vercel):

| Variável | Valor (painel do Supabase → *Connect*) |
|---|---|
| `DATABASE_URL` | *Transaction pooler* (porta **6543**) |
| `DIRECT_DATABASE_URL` | *Session pooler* (porta **5432**) — a conexão "direct" só tem IPv6 sem o add-on de IPv4 |

Troque `[YOUR-PASSWORD]` pela senha do banco. Não testado contra um projeto Supabase real.

Em serverless cada instância segura poucas conexões (`DB_POOL_MAX`) e o pool é registrado com `attachDatabasePool`
(`@vercel/functions`) para liberar conexões quando a função é suspensa — por isso a URL do pooler é obrigatória.

> ⚠️ A API **não tem autenticação**: quem souber a URL lê e altera clientes (CPF/CNPJ, telefones) e pedidos.
> Proteja antes de divulgar (login, ou proteção de deploy da Vercel/firewall).

## Solução de problemas

**`ECONNREFUSED` ao iniciar / front mostra "Não foi possível carregar os dados"** — o PostgreSQL não está rodando.
Com podman/docker rootless o container para quando a sessão termina e **não** volta sozinho:

```bash
docker start zeut-db        # ou: docker compose up -d
```

A API tenta reconectar por ~30 s (avisando no log) e inicia sozinha assim que o banco responde; os dados ficam no
volume `zeut_gestao_api_zeut-pgdata` e não se perdem. Se o banco estiver em outro host/porta, ajuste `DATABASE_URL` no `.env`.

