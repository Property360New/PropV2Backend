// ============================================================
// src/common/decorators/company.decorator.ts
// Extracts companyId from JWT payload — consistent across all controllers
// ============================================================
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CompanyId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    return ctx.switchToHttp().getRequest().user?.companyId;
  },
);
