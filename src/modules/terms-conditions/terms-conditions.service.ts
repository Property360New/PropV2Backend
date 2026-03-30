import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Designation } from '@prisma/client';
import { CreateTermsDto } from './dto/create-terms.dto';
import { AcceptTermsDto } from './dto/accept-terms.dto';

@Injectable()
export class TermsConditionsService {
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
    if (!resolvedCompanyId) return null;
    return prisma.termsConditions.findFirst({
      where: { companyId: resolvedCompanyId, isActive: true },
      orderBy: { version: 'desc' },
    });
  }

  async getHistory(companyId: string) {
    const prisma = this.prisma as any;
    return prisma.termsConditions.findMany({
      where: { companyId },
      orderBy: { version: 'desc' },
    });
  }

  async createNewVersion(companyId: string, createdById: string, designation: Designation, dto: CreateTermsDto) {
    if (designation !== Designation.ADMIN) throw new ForbiddenException('Only admin can publish terms');
    const prisma = this.prisma as any;
    const latest = await prisma.termsConditions.findFirst({
      where: { companyId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    await prisma.termsConditions.updateMany({
      where: { companyId, isActive: true },
      data: { isActive: false },
    });

    return prisma.termsConditions.create({
      data: {
        companyId,
        content: dto.content,
        version: nextVersion,
        isActive: true,
        createdById,
      },
    });
  }

  async needsAcceptance(companyId: string, userId: string) {
    const prisma = this.prisma as any;
    const latest = await this.getLatest(companyId);
    if (!latest) return { mustAccept: false, terms: null };
    const acceptance = await prisma.termsAcceptance.findUnique({
      where: { termsId_userId: { termsId: latest.id, userId } },
    });
    return { mustAccept: !acceptance, terms: latest };
  }

  async accept(companyId: string, userId: string, dto: AcceptTermsDto, reqMeta?: { ip?: string; ua?: string }) {
    const prisma = this.prisma as any;
    const terms = dto.termsId
      ? await prisma.termsConditions.findUnique({ where: { id: dto.termsId } })
      : await this.getLatest(companyId);

    if (!terms) throw new NotFoundException('Terms not found');
    if (terms.companyId !== companyId) throw new ForbiddenException('Invalid scope');
    if (!terms.isActive) throw new BadRequestException('Terms is not active');

    return prisma.termsAcceptance.upsert({
      where: { termsId_userId: { termsId: terms.id, userId } },
      create: {
        termsId: terms.id,
        userId,
        ipAddress: reqMeta?.ip ?? null,
        userAgent: reqMeta?.ua ?? null,
      },
      update: {
        acceptedAt: new Date(),
        ipAddress: reqMeta?.ip ?? null,
        userAgent: reqMeta?.ua ?? null,
      },
    });
  }
}
