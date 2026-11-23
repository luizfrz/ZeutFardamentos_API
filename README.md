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

`POST /auth/login` (pública) · `GET /auth/me` · `GET/POST/PATCH/DELETE /users` (só admin) — as demais rotas exigem `Authorization: Bearer <token>`
`GET/POST /orders` · `GET /orders/summary` · `GET/PATCH /orders/:id` · `PATCH /orders/:id/status`
`GET/POST /clients` · `GET/POST /responsibles` · `GET/POST /molds` · `DELETE /molds/:id` · `GET /size-grids`

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
