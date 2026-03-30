// ============================================================
// src/common/guards/roles.guard.ts
// Checks designation-based access
// ============================================================
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Designation } from '@prisma/client';
 
// Designation hierarchy levels (higher = more access)
export const DESIGNATION_LEVEL: Record<Designation, number> = {
  SALES_EXECUTIVE: 1,
  TEAM_LEAD: 2,
  SALES_MANAGER: 3,
  AREA_MANAGER: 4,
  DGM: 5,
  GM: 6,
  SALES_COORDINATOR: 7, // parallel to VP_SALES
  VP_SALES: 7,
  ADMIN: 99,
};
 
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
 
  canActivate(context: ExecutionContext): boolean {
    const requiredDesignations = this.reflector.getAllAndOverride<Designation[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
 
    if (!requiredDesignations || requiredDesignations.length === 0) return true;
 
    const { user } = context.switchToHttp().getRequest();
    const userLevel = DESIGNATION_LEVEL[user.designation as Designation] ?? 0;
 
    const hasAccess = requiredDesignations.some(
      (d) => DESIGNATION_LEVEL[d] <= userLevel,
    );
 
    if (!hasAccess) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredDesignations.join(' or ')}`,
      );
    }
 
    return true;
  }
}