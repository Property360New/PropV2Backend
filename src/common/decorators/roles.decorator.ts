// ============================================================
// src/common/decorators/roles.decorator.ts
// ============================================================
import { SetMetadata } from '@nestjs/common';
import { Designation } from '@prisma/client';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Designation[]) => SetMetadata(ROLES_KEY, roles);