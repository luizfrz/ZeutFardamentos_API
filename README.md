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

Na primeira subida a API cria o catálogo inicial (grades de tamanho e moldes) se ainda não existir.
Nada além disso é pré-cadastrado.

## Endpoints

`GET/POST /orders` · `GET /orders/summary` · `GET/PATCH /orders/:id` · `PATCH /orders/:id/status`
`GET/POST /clients` · `GET/POST /responsibles` · `GET/POST /molds` · `GET /size-grids`

## Regras

- **Prioridade**: menos de 7 dias → URGENTE (≥ 50 peças) ou ALTA · 7–14 dias → MÉDIA · mais de 14 → BAIXA (`src/common/priority.ts`).
- **Data de entrega**: data inexistente é recusada; data passada só é aceita com `allowPastDate: true`
  (na edição, só se a data foi alterada).
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

## Solução de problemas

**`ECONNREFUSED` ao iniciar / front mostra "Não foi possível carregar os dados"** — o PostgreSQL não está rodando.
Com podman/docker rootless o container para quando a sessão termina e **não** volta sozinho:

```bash
docker start zeut-db        # ou: docker compose up -d
```

A API tenta reconectar por ~30 s (avisando no log) e inicia sozinha assim que o banco responde; os dados ficam no
volume `zeut_gestao_api_zeut-pgdata` e não se perdem. Se o banco estiver em outro host/porta, ajuste `DATABASE_URL` no `.env`.

