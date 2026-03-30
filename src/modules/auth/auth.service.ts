// ============================================================
// src/modules/auth/auth.service.ts
// ============================================================
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import type { StringValue } from 'ms';
import { UpdateProfileDto } from './dto/update-profile.dto';

export interface JwtPayload {
  sub: string;        // userId
  employeeId: string;
  companyId: string;
  designation: string;
  email: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) { }

  // ── Login ────────────────────────────────────────────────
  async login(dto: LoginDto): Promise<{
    accessToken: string;
    refreshToken: string;
    employee: Record<string, unknown>;
  }> {
    const prisma = this.prisma as any;
    const user = await prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: {
        employee: {
          include: { company: { select: { id: true, name: true, isActive: true } } },
        },
      },
    });

    if (!user || !user.employee) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) {
      throw new ForbiddenException('Account deactivated. Contact admin.');
    }
    if (!user.employee.isActive) {
      throw new ForbiddenException('Employee account deactivated. Contact admin.');
    }
    if (!user.employee.company.isActive) {
      throw new ForbiddenException('Company account inactive.');
    }

    // Check if user has accepted latest terms
    const latestTerms = await prisma.termsConditions.findFirst({
      where: { companyId: user.employee.companyId, isActive: true },
      orderBy: { version: 'desc' },
    });

    const tokens = await this.generateTokens(user.id, user.employee);

    // Save hashed refresh token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: await bcrypt.hash(tokens.refreshToken, this.BCRYPT_ROUNDS),
        lastLoginAt: new Date(),
      },
    });

    this.logger.log(`Login: ${user.email} (${user.employee.designation})`);

    return {
      ...tokens,
      employee: {
        id: user.employee.id,
        firstName: user.employee.firstName,
        lastName: user.employee.lastName,
        designation: user.employee.designation,
        avatar: user.employee.avatar,
        companyId: user.employee.companyId,
        dailyCallTarget: user.employee.dailyCallTarget,
        monthlySalesTarget: user.employee.monthlySalesTarget,
      },
      // Return latestTermsAccepted flag so frontend can redirect if needed
      ...(latestTerms ? { mustAcceptTerms: await this.checkTermsAccepted(user.id, latestTerms.id) } : {}),
    } as any;
  }

  // ── Refresh Tokens ───────────────────────────────────────
  async refreshTokens(userId: string, refreshToken: string) {
    const prisma = this.prisma as any;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true },
    });

    if (!user || !user.refreshTokenHash) {
      throw new ForbiddenException('Access denied');
    }

    const tokenValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!tokenValid) throw new ForbiddenException('Access denied');

    if (!user.employee) throw new ForbiddenException('Employee not found');

    const tokens = await this.generateTokens(user.id, user.employee);
    await prisma.user.update({
      where: { id: userId },
      data: {
        refreshTokenHash: await bcrypt.hash(tokens.refreshToken, this.BCRYPT_ROUNDS),
      },
    });

    return tokens;
  }

  // ── Logout ───────────────────────────────────────────────
  async logout(userId: string) {
    const prisma = this.prisma as any;
    await prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  async getProfile(userId: string, user: any) {
  const prisma = this.prisma as any;
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      lastLoginAt: true,
      employee: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          birthday: true,
          marriageAnniversary: true,
          dailyCallTarget: true,
          monthlySalesTarget: true,
          avatar: true,
        },
      },
    },
  });

  return {
    userId,
    email: dbUser?.email ?? '',
    lastLoginAt: dbUser?.lastLoginAt ?? null,
    employeeId: user.employeeId,
    companyId: user.companyId,
    designation: user.designation,
    subordinateIds: user.subordinateIds ?? [],
    permissions: user.permissions ?? {},
    reportingManagerId: user.reportingManagerId ?? null,
    // Employee fields — now from DB, not JWT
    firstName: dbUser?.employee?.firstName ?? '',
    lastName: dbUser?.employee?.lastName ?? '',
    phone: dbUser?.employee?.phone ?? null,
    birthday: dbUser?.employee?.birthday ?? null,
    marriageAnniversary: dbUser?.employee?.marriageAnniversary ?? null,
    dailyCallTarget: dbUser?.employee?.dailyCallTarget ?? null,
    monthlySalesTarget: dbUser?.employee?.monthlySalesTarget ?? null,
    avatar: dbUser?.employee?.avatar ?? null,
  };
}

  async updateProfile(companyId: string, employeeId: string, dto: UpdateProfileDto) {
    const prisma = this.prisma as any;
    const phoneDigits = dto.phone ? dto.phone.replace(/\D/g, '') : undefined;
    if (phoneDigits && phoneDigits.length !== 10) {
      throw new BadRequestException('Phone must be 10 digits');
    }

    const employee = await prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(dto.firstName != null ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName != null ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.phone != null ? { phone: phoneDigits || null } : {}),
        ...(dto.avatar != null ? { avatar: dto.avatar || null } : {}),
        ...(dto.birthday != null ? { birthday: dto.birthday ? new Date(dto.birthday) : null } : {}),
        ...(dto.marriageAnniversary != null
          ? { marriageAnniversary: dto.marriageAnniversary ? new Date(dto.marriageAnniversary) : null }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        designation: true,
        avatar: true,
        phone: true,
        birthday: true,
        marriageAnniversary: true,
        companyId: true,
      },
    });

    if (employee.companyId !== companyId) {
      throw new ForbiddenException('Invalid scope');
    }

    return employee;
  }

  // ── Change Password ──────────────────────────────────────
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const prisma = this.prisma as any;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    const hash = await bcrypt.hash(newPassword, this.BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hash, refreshTokenHash: null }, // invalidate all sessions
    });
  }

  // ── Token Helpers ─────────────────────────────────────────
  private async generateTokens(userId: string, employee: any) {
    const payload: JwtPayload = {
      sub: userId,
      employeeId: employee.id,
      companyId: employee.companyId,
      designation: employee.designation,
      email: '',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
        expiresIn: this.config.getOrThrow<string>('jwt.accessExpiresIn') as StringValue,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: this.config.getOrThrow<string>('jwt.refreshExpiresIn') as StringValue,
      }),
    ]);

    return { accessToken, refreshToken };
  }


  private async checkTermsAccepted(userId: string, termsId: string): Promise<boolean> {
    const prisma = this.prisma as any;
    const acceptance = await prisma.termsAcceptance.findUnique({
      where: { termsId_userId: { termsId, userId } },
    });
    return !acceptance; // returns true if they MUST accept (not yet accepted)
  }

  // ── Create first user (called during seeding) ──────────────
  async createUser(data: {
    email: string;
    password: string;
    companyId: string;
    firstName: string;
    lastName?: string;
    designation: any;
  }) {
    const prisma = this.prisma as any;
    const hash = await bcrypt.hash(data.password, this.BCRYPT_ROUNDS);
    return prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        password: hash,
        employee: {
          create: {
            companyId: data.companyId,
            firstName: data.firstName,
            lastName: data.lastName,
            designation: data.designation,
            canManageEmployees: true,
            canViewAllAttendance: true,
            canViewAllFreshLeads: true,
            canEditInventory: true,
            canAddExpenses: true,
          },
        },
      },
      include: { employee: true },
    });
  }
}
