import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Libera a rota (ou o controller inteiro) da exigência de login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
