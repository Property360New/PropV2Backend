import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Designation } from '@prisma/client';
import { UpsertPrivacyPolicyDto } from './dto/upsert-privacy-policy.dto';

type PrivacyPolicySettings = {
  content: string;
  version: number;
  updatedAt: string;
};

@Injectable()
export class PrivacyPolicyService {
  constructor(private prisma: PrismaService) {}

  private async resolveCompanyId(companyId?: string) {
    if (companyId) return companyId;
    const prisma = this.prisma as any;
    const company = await prisma.company.findFirst({
      where: { isActive: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return company?.id as string | undefined;
  }

  async getLatest(companyId?: string) {
    const prisma = this.prisma as any;
    const resolvedCompanyId = await this.resolveCompanyId(companyId);
    if (!resolvedCompanyId) {
      return {
        content: 'Privacy policy is not configured yet.',
        version: 0,
        updatedAt: new Date(0).toISOString(),
      };
    }
    const company = await prisma.company.findUnique({
      where: { id: resolvedCompanyId },
      select: { settings: true },
    });
    const settings = (company?.settings ?? {}) as any;
    const pp = settings.privacyPolicy as PrivacyPolicySettings | undefined;
    return (
      pp ?? {
        content: 'Privacy policy is not configured yet.',
        version: 0,
        updatedAt: new Date(0).toISOString(),
      }
    );
  }

  async upsert(companyId: string, designation: Designation, dto: UpsertPrivacyPolicyDto) {
    if (designation !== Designation.ADMIN) throw new ForbiddenException('Only admin can publish privacy policy');
    const prisma = this.prisma as any;
    const current = await this.getLatest(companyId);
    const next: PrivacyPolicySettings = {
      content: dto.content,
      version: (current?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } });
    const settings = (company?.settings ?? {}) as any;
    settings.privacyPolicy = next;
    await prisma.company.update({
      where: { id: companyId },
      data: { settings },
    });
    return next;
  }
}
