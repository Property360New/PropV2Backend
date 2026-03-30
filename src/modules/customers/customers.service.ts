import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Designation } from '@prisma/client';
import { TargetsService } from '../targets/targets.service';
import { IsOptional, IsNumber, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateDealDetailsDto {
  @IsOptional() @IsNumber() @Type(() => Number)
  leadActualSlab?: number;
  @IsOptional() @IsNumber() @Type(() => Number)
  discount?: number;
  @IsOptional() @IsNumber() @Type(() => Number)
  actualRevenue?: number;
  @IsOptional() @IsNumber() @Type(() => Number)
  incentiveSlab?: number;
  @IsOptional() @IsNumber() @Type(() => Number)
  salesRevenue?: number;
  @IsOptional() @IsNumber() @Type(() => Number)
  incentiveAmount?: number;
  @IsOptional() @IsNumber() @Type(() => Number)
  dealValue?: number;
  @IsOptional() @IsString()
  incentiveNote?: string;
}

export class ListCustomersDto {
  @IsOptional() @IsNumber() @Type(() => Number)
  page?: number;
  @IsOptional() @IsNumber() @Type(() => Number)
  limit?: number;
  @IsOptional() @IsString()
  search?: string;
  @IsOptional() @IsString()
  assignedToId?: string;
}

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private targetsService: TargetsService,
  ) {}

  async getCustomers(companyId, user, dto: ListCustomersDto) {
    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(100, dto.limit ?? 20);
    const skip = (page - 1) * limit;
    const isAdmin = user.designation === Designation.ADMIN;
    const scopeIds = isAdmin ? null : [user.employeeId, ...user.subordinateIds];

    const where: any = {
      companyId,
      ...(scopeIds ? { assignedToId: { in: scopeIds } } : {}),
      ...(dto.assignedToId && isAdmin ? { assignedToId: dto.assignedToId } : {}),
      ...(dto.search ? {
        OR: [
          { name: { contains: dto.search, mode: 'insensitive' } },
          { phone: { contains: dto.search } },
        ],
      } : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: { select: { id: true, source: true, type: true, project: { select: { name: true } } } },
          assignedTo: { select: { id: true, firstName: true, lastName: true, designation: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          // ── include deals summary ──
          deals: {
            select: {
              id: true, dealValue: true, incentiveAmount: true,
              salesRevenue: true, closingAmount: true, dealDoneDate: true,
              unitNo: true, createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getCustomerById(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId },
      include: {
        lead: {
          include: {
            queries: {
              where: { status: 'DEAL_DONE' },  // only deal-done queries
              orderBy: { createdAt: 'desc' },
              include: {
                createdBy: { select: { firstName: true, lastName: true } },
                project: { select: { id: true, name: true } },
                deal: true,  // include deal details for each query
              },
            },
            project: true,
          },
        },
        assignedTo: { select: { id: true, firstName: true, lastName: true, designation: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        deals: {
          orderBy: { createdAt: 'desc' },
          include: {
            query: {
              select: {
                id: true, closingAmount: true, unitNo: true,
                dealDoneDate: true, createdAt: true,
                createdBy: { select: { firstName: true, lastName: true } },
                project: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  // ── Update deal details for a specific Deal (by queryId) ──
  async updateDealDetails(
    companyId: string,
    customerId: string,
    queryId: string,          // ← now targets a specific deal
    dto: UpdateDealDetailsDto,
    designation: Designation,
  ) {
    if (designation !== Designation.ADMIN) {
      throw new ForbiddenException('Only admin can update deal details');
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // Upsert deal for this specific query
    const previousDeal = await this.prisma.deal.findUnique({ where: { queryId } });
    const previousSalesRevenue = Number(previousDeal?.salesRevenue ?? 0);
    const newSalesRevenue = dto.salesRevenue ?? previousSalesRevenue;

    const deal = await this.prisma.deal.upsert({
      where: { queryId },
      create: {
        companyId,
        customerId,
        queryId,
        createdById: customer.createdById,
        assignedToId: customer.assignedToId ?? undefined,
        ...dto,
      },
      update: {
        ...(dto.leadActualSlab !== undefined && { leadActualSlab: dto.leadActualSlab }),
        ...(dto.discount !== undefined && { discount: dto.discount }),
        ...(dto.actualRevenue !== undefined && { actualRevenue: dto.actualRevenue }),
        ...(dto.incentiveSlab !== undefined && { incentiveSlab: dto.incentiveSlab }),
        ...(dto.salesRevenue !== undefined && { salesRevenue: dto.salesRevenue }),
        ...(dto.incentiveAmount !== undefined && { incentiveAmount: dto.incentiveAmount }),
        ...(dto.dealValue !== undefined && { dealValue: dto.dealValue }),
        ...(dto.incentiveNote !== undefined && { incentiveNote: dto.incentiveNote }),
      },
    });

    // Adjust target salesAchieved for the diff
    if (dto.salesRevenue !== undefined && customer.assignedToId) {
      const diff = newSalesRevenue - previousSalesRevenue;
      if (diff !== 0) {
        const now = new Date();
        await this.targetsService.adjustSalesAchieved(
          customer.assignedToId, companyId,
          now.getMonth() + 1, now.getFullYear(), diff,
        );
      }
    }

    return deal;
  }

  // ── Summarize total incentive across all deals for a customer ──
  async getCustomerDealSummary(companyId: string, customerId: string) {
    const deals = await this.prisma.deal.findMany({
      where: { companyId, customerId },
    });
    return {
      totalDeals: deals.length,
      totalDealValue: deals.reduce((s, d) => s + Number(d.dealValue ?? 0), 0),
      totalSalesRevenue: deals.reduce((s, d) => s + Number(d.salesRevenue ?? 0), 0),
      totalIncentive: deals.reduce((s, d) => s + Number(d.incentiveAmount ?? 0), 0),
    };
  }
}