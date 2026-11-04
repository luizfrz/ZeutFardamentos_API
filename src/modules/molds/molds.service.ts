import { BadRequestException, Injectable } from '@nestjs/common';
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
        hasSizes: dto.hasSizes ?? false, variationOfId: dto.variationOfId, notes: dto.notes,
      },
    }));
  }
}
