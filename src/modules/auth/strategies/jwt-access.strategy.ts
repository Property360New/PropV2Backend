// ============================================================
// src/modules/auth/strategies/jwt-access.strategy.ts
// ============================================================
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload } from '../auth.service';
 
@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }
 
  async validate(payload: JwtPayload) {
    // Verify employee still exists and is active
    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.employeeId },
      select: {
        id: true,
        isActive: true,
        status: true,
        designation: true,
        companyId: true,
        subordinateIds: true,
        canViewAllFreshLeads: true,
        canEditInventory: true,
        canAddExpenses: true,
        canManageEmployees: true,
        canViewAllAttendance: true,
        reportingManagerId: true,
      },
    });
 
    if (!employee || !employee.isActive) {
      throw new UnauthorizedException('Account deactivated');
    }
 
    // Return enriched user object — available as req.user everywhere
    return {
      ...payload,
      employeeId: employee.id,
      designation: employee.designation,
      companyId: employee.companyId,
      subordinateIds: employee.subordinateIds,
      permissions: {
        canViewAllFreshLeads: employee.canViewAllFreshLeads,
        canEditInventory: employee.canEditInventory,
        canAddExpenses: employee.canAddExpenses,
        canManageEmployees: employee.canManageEmployees,
        canViewAllAttendance: employee.canViewAllAttendance,
      },
      reportingManagerId: employee.reportingManagerId,
    };
  }
}