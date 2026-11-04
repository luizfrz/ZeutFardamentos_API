import type { PrismaClient } from '../generated/prisma/client.js';

/** Grades de tamanho e moldes iniciais usados pelos formulários. */
const GRIDS = [
  { id: 'g-infantil', name: 'Infantil', description: '2 a 16 anos', sizes: ['2', '4', '6', '8', '10', '12', '14', '16'] },
  { id: 'g-babylook', name: 'Babylook', description: 'PP ao XGG baby look', sizes: ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'] },
  { id: 'g-plus', name: 'Plus Size', description: '2 tamanhos', sizes: ['Plus I', 'Plus II'] },
  { id: 'g-unissex', name: 'Unissex', description: 'PP ao Extra XGG', sizes: ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EXG'] },
];

const MOLDS = [
  { id: 'm-blusa', category: 'BLUSA', name: 'Blusa', models: ['Gola polo', 'Raglan', 'Manga longa', 'Manga 3/4'], gridIds: GRIDS.map((g) => g.id) },
  { id: 'm-estojo10', category: 'ESTOJO_BOLSA', name: 'Estojo 10' },
  { id: 'm-estojo12', category: 'ESTOJO_BOLSA', name: 'Estojo 12' },
  { id: 'm-estojo14', category: 'ESTOJO_BOLSA', name: 'Estojo 14' },
  { id: 'm-estojo16', category: 'ESTOJO_BOLSA', name: 'Estojo 16' },
  { id: 'm-make', category: 'ESTOJO_BOLSA', name: 'Necessaire Make' },
  { id: 'm-box', category: 'ESTOJO_BOLSA', name: 'Necessaire Box', variationOfId: 'm-make' },
  { id: 'm-mochila', category: 'OUTRO', name: 'Mochila', group: 'Mochilas' },
  { id: 'm-mochila-lona', category: 'OUTRO', name: 'Mochila de lona', group: 'Mochilas', variationOfId: 'm-mochila' },
  { id: 'm-capa-violao', category: 'OUTRO', name: 'Capa para violão', group: 'Capas' },
  { id: 'm-bolsa-gabinete', category: 'OUTRO', name: 'Bolsa para gabinete' },
] as const;

/**
 * Semeia o catálogo inicial só quando as tabelas estão vazias (primeira subida).
 * Assim, um molde excluído pelo usuário não reaparece a cada reinício da API.
 */
export async function ensureCatalog(prisma: PrismaClient) {
  if ((await prisma.sizeGrid.count()) === 0) {
    await prisma.sizeGrid.createMany({ data: GRIDS.map((g, position) => ({ ...g, position })), skipDuplicates: true });
  }
  if ((await prisma.mold.count()) === 0) {
    // moldes-base antes das variações (FK de variationOfId)
    for (const m of [...MOLDS].sort((a, b) => Number('variationOfId' in a) - Number('variationOfId' in b))) {
      await prisma.mold.create({ data: { ...m, models: [...('models' in m ? m.models : [])], gridIds: [...('gridIds' in m ? m.gridIds : [])] } });
    }
  }
}
