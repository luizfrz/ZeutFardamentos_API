import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { toGrid, toMold } from '../../common/mappers.js';
import type { Mold, MoldCategory, SizeGrid } from '../../common/types.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type CreateMoldDto = Omit<Mold, 'id'> & { category: MoldCategory };

@Injectable()
export class MoldsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Mold[]> {
    return (await this.prisma.mold.findMany({ orderBy: [{ createdAt: 'asc' }, { name: 'asc' }] })).map(toMold);
  }

  async grids(): Promise<SizeGrid[]> {
    return (await this.prisma.sizeGrid.findMany({ orderBy: { position: 'asc' } })).map(toGrid);
  }

  /** Troca os tamanhos de uma grade. Não remove tamanho que algum pedido já usa (a tabela do pedido depende dele). */
  async updateGrid(id: string, sizes: unknown): Promise<SizeGrid> {
    const grid = await this.prisma.sizeGrid.findUnique({ where: { id } });
    if (!grid) throw new NotFoundException('Grade não encontrada');
    if (!Array.isArray(sizes) || sizes.some((s) => typeof s !== 'string')) throw new BadRequestException('Tamanhos inválidos');
    const clean = [...new Set((sizes as string[]).map((s) => s.trim()).filter(Boolean))];
    if (!clean.length || clean.length > 40 || clean.some((s) => s.length > 20)) {
      throw new BadRequestException('Informe de 1 a 40 tamanhos (até 20 caracteres cada)');
    }
    const removed = grid.sizes.filter((s) => !clean.includes(s));
    if (removed.length) {
      const items = await this.prisma.orderItem.findMany({ where: { grids: { not: Prisma.DbNull } }, select: { grids: true } });
      const used = removed.filter((size) => items.some((i) => (i.grids as { gridId: string; quantities: Record<string, number> }[]).some((g) => g.gridId === id && g.quantities[size] > 0)));
      if (used.length) throw new ConflictException(`Já há pedidos com os tamanhos ${used.join(', ')}. Eles não podem ser removidos.`);
    }
    return toGrid(await this.prisma.sizeGrid.update({ where: { id }, data: { sizes: clean } }));
  }

  async create(dto: CreateMoldDto): Promise<Mold> {
    const errors: string[] = [];
    const name = dto.name?.trim();
    if (!name) errors.push('Nome do molde é obrigatório');
    else if (await this.prisma.mold.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })) errors.push('Já existe um molde com este nome');
    if (dto.variationOfId && !(await this.prisma.mold.findUnique({ where: { id: dto.variationOfId } }))) errors.push('Modelo de origem não encontrado');
    if (dto.category === 'BLUSA') {
      if (!dto.models?.length) errors.push('Selecione ao menos um modelo');
      if (!dto.gridIds?.length) errors.push('Selecione ao menos uma grade de tamanho');
    }
    if (errors.length) throw new BadRequestException(errors);
    return toMold(await this.prisma.mold.create({
      data: {
        category: dto.category, name: name!, group: dto.group, models: dto.models ?? [], gridIds: dto.gridIds ?? [],
        hasSizes: dto.hasSizes ?? false, variationOfId: dto.variationOfId, notes: dto.notes, size: dto.size?.trim() || null,
      },
    }));
  }

  /** Só exclui moldes que não foram usados em nenhum pedido e não têm variações (o histórico nunca é alterado). */
  async remove(id: string): Promise<{ id: string }> {
    const mold = await this.prisma.mold.findUnique({ where: { id }, include: { variations: { select: { name: true } } } });
    if (!mold) throw new NotFoundException('Molde não encontrado');
    if (mold.variations.length) {
      throw new ConflictException(`Este molde tem variações (${mold.variations.map((v) => v.name).join(', ')}). Exclua as variações primeiro.`);
    }
    if (await this.prisma.orderItem.count({ where: { moldId: id } })) {
      throw new ConflictException('Este molde já foi usado em pedidos e não pode ser excluído.');
    }
    await this.prisma.mold.delete({ where: { id } });
    return { id };
  }
}
