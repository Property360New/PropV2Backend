import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Designation,
  InventoryType,
  InventorySubType,
  BHKType,
  FurnishingType,
} from '@prisma/client';

import {
  IsString, IsOptional, IsEnum, IsNumber,
  IsBoolean, IsEmail, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInventoryDto {
  @IsString()
  ownerName: string;

  @IsString()
  ownerPhone: string;

  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @IsEnum(InventoryType)
  inventoryType: InventoryType;

  @IsEnum(InventorySubType)
  inventorySubType: InventorySubType;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  unitNo?: string;

  @IsOptional()
  @IsString()
  towerNo?: string;

  @IsOptional()
  @IsEnum(BHKType)
  bhk?: BHKType;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  size?: number;

  @IsOptional()
  @IsString()
  facing?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  demand?: number;

  @IsOptional()
  @IsBoolean()
  hasTenant?: boolean;

  @IsOptional()
  @IsBoolean()
  hasParking?: boolean;

  @IsOptional()
  @IsString()
  expectedVisitTime?: string;

  @IsOptional()
  @IsDateString()
  availableDate?: Date;

  @IsOptional()
  @IsEnum(FurnishingType)
  furnishingType?: FurnishingType;

  @IsOptional()
  @IsString()
  inventoryStatus?: string;
}

export class UpdateInventoryDto {
  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  ownerPhone?: string;

  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  unitNo?: string;

  @IsOptional()
  @IsString()
  towerNo?: string;

  @IsOptional()
  @IsEnum(BHKType)
  bhk?: BHKType;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  size?: number;

  @IsOptional()
  @IsString()
  facing?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  demand?: number;

  @IsOptional()
  @IsBoolean()
  hasTenant?: boolean;

  @IsOptional()
  @IsBoolean()
  hasParking?: boolean;

  @IsOptional()
  @IsString()
  expectedVisitTime?: string;

  @IsOptional()
  @IsDateString()
  availableDate?: Date;

  @IsOptional()
  @IsEnum(FurnishingType)
  furnishingType?: FurnishingType;

  @IsOptional()
  @IsString()
  inventoryStatus?: string;
}

export class ListInventoryDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsEnum(InventoryType)
  inventoryType?: InventoryType;

  @IsOptional()
  @IsEnum(InventorySubType)
  inventorySubType?: InventorySubType;

  @IsOptional()
  @IsEnum(BHKType)
  bhk?: BHKType;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  minDemand?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxDemand?: number;

  /**
   * Filter by active status.
   * - undefined / omitted → show ALL (active + inactive)
   * - "true"             → show only active
   * - "false"            → show only inactive
   */
  @IsOptional()
  @IsString()
  isActive?: string; // query params arrive as strings; we coerce in the service
}

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  private checkAccess(designation: Designation, canEditInventory: boolean) {
    if (designation !== Designation.ADMIN && !canEditInventory) {
      throw new ForbiddenException('Not authorized to manage inventory');
    }
  }

  async createInventory(
    companyId: string,
    employeeId: string,
    dto: CreateInventoryDto,
    designation: Designation,
    canEditInventory: boolean,
  ) {
    this.checkAccess(designation, canEditInventory);
    return this.prisma.inventory.create({
      data: { companyId, lastEditedById: employeeId, ...dto },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async getInventory(companyId: string, dto: ListInventoryDto) {
    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(100, dto.limit ?? 20);
    const skip = (page - 1) * limit;

    // Resolve isActive filter: undefined → no filter (show all), else coerce string
    let isActiveFilter: boolean | undefined;
    if (dto.isActive === 'true') isActiveFilter = true;
    else if (dto.isActive === 'false') isActiveFilter = false;
    // else undefined → no restriction

    const where: any = {
      companyId,
      ...(isActiveFilter !== undefined ? { isActive: isActiveFilter } : {}),
      ...(dto.inventoryType ? { inventoryType: dto.inventoryType } : {}),
      ...(dto.inventorySubType ? { inventorySubType: dto.inventorySubType } : {}),
      ...(dto.bhk ? { bhk: dto.bhk } : {}),
      ...(dto.projectId ? { projectId: dto.projectId } : {}),
      ...(dto.minDemand || dto.maxDemand
        ? {
            demand: {
              ...(dto.minDemand ? { gte: dto.minDemand } : {}),
              ...(dto.maxDemand ? { lte: dto.maxDemand } : {}),
            },
          }
        : {}),
      ...(dto.search
        ? {
            OR: [
              { ownerName: { contains: dto.search, mode: 'insensitive' } },
              { ownerPhone: { contains: dto.search } },
              { unitNo: { contains: dto.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.inventory.count({ where }),
      this.prisma.inventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { project: { select: { id: true, name: true } } },
      }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getInventoryById(companyId: string, inventoryId: string) {
    const item = await this.prisma.inventory.findFirst({
      where: { id: inventoryId, companyId },
      include: { project: true },
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }

  async updateInventory(
    companyId: string,
    inventoryId: string,
    employeeId: string,
    dto: UpdateInventoryDto,
    designation: Designation,
    canEditInventory: boolean,
  ) {
    this.checkAccess(designation, canEditInventory);
    const item = await this.prisma.inventory.findFirst({
      where: { id: inventoryId, companyId },
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    return this.prisma.inventory.update({
      where: { id: inventoryId },
      data: { ...dto, lastEditedById: employeeId },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  /**
   * Toggle the isActive flag on an inventory item.
   * Any authorised user (canEditInventory or ADMIN) may call this.
   */
  async toggleInventoryStatus(
    companyId: string,
    inventoryId: string,
    employeeId: string,
    isActive: boolean,
    designation: Designation,
    canEditInventory: boolean,
  ) {
    this.checkAccess(designation, canEditInventory);
    const item = await this.prisma.inventory.findFirst({
      where: { id: inventoryId, companyId },
    });
    if (!item) throw new NotFoundException('Inventory item not found');

    return this.prisma.inventory.update({
      where: { id: inventoryId },
      data: {
        isActive,
        deletedAt: isActive ? null : new Date(),
        lastEditedById: employeeId,
      },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async deleteInventory(
    companyId: string,
    inventoryId: string,
    designation: Designation,
    canEditInventory: boolean,
  ) {
    this.checkAccess(designation, canEditInventory);
    const item = await this.prisma.inventory.findFirst({
      where: { id: inventoryId, companyId },
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    await this.prisma.inventory.update({
      where: { id: inventoryId },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { message: 'Inventory item deleted successfully' };
  }
}