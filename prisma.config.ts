import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrações usam a conexão DIRETA quando existe (bancos com pooler, como o Neon, não suportam migrate pelo pooler);
  // a API em execução sempre usa DATABASE_URL.
  datasource: { url: process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] },
});
