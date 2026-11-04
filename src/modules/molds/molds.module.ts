import { Module } from '@nestjs/common';
import { MoldsController } from './molds.controller.js';
import { MoldsService } from './molds.service.js';

@Module({ controllers: [MoldsController], providers: [MoldsService], exports: [MoldsService] })
export class MoldsModule {}
