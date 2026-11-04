import { SetMetadata } from '@nestjs/common';
import type { Role } from './auth.service.js';

export const ROLES_KEY = 'roles';
/** Restringe a rota (ou o controller) a certos papéis. O papel é conferido no banco, não só no token. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
