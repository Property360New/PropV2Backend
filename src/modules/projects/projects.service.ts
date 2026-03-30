import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Designation } from '@prisma/client';

import { IsString, IsOptional, IsNumber, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional() @IsString()
  clientName?: string;

  @IsOptional() @IsString()
  product?: string;

  @IsOptional() @IsNumber() @Type(() => Number)
  sizeInSqft?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  floors?: number;

  @IsOptional() @IsString()
  paymentPlan?: string;

  @IsOptional() @IsNumber() @Type(() => Number)
  basicSellPrice?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  discount?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  viewPlc?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  cornerPlc?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  floorPlc?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  edc?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  idc?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  ffc?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  otherAdditionalCharges?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  leastRent?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  otherPossessionCharges?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  gstPercent?: number;

  @IsOptional() @IsString()
  note1?: string;

  @IsOptional() @IsString()
  note2?: string;

  @IsOptional() @IsString()
  note3?: string;

  @IsOptional() @IsString()
  note4?: string;

  @IsOptional() @IsNumber() @Type(() => Number)
  powerBackupKva?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  powerBackupPrice?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  onBookingPercent?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  within30DaysPercent?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  onPossessionPercent?: number;
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) { }

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) { }

  private checkAccess(designation: Designation, canEditInventory: boolean) {
    if (designation !== Designation.ADMIN && !canEditInventory) {
      throw new ForbiddenException('Not authorized to manage projects');
    }
  }

  async createProject(
    companyId: string,
    dto: CreateProjectDto,
    designation: Designation,
    canEditInventory: boolean,
  ) {
    this.checkAccess(designation, canEditInventory);
    return this.prisma.project.create({ data: { companyId, ...dto } });
  }

  async getProjects(companyId: string) {
    return this.prisma.project.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
      // No select — returns all fields
      include: {
        _count: { select: { leads: true, inventory: true } },
      },
    });
  }

  async getProjectById(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId, isActive: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async updateProject(
    companyId: string,
    projectId: string,
    dto: UpdateProjectDto,
    designation: Designation,
    canEditInventory: boolean,
  ) {
    this.checkAccess(designation, canEditInventory);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId, isActive: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return this.prisma.project.update({ where: { id: projectId }, data: dto });
  }

  async deleteProject(
    companyId: string,
    projectId: string,
    designation: Designation,
  ) {
    if (designation !== Designation.ADMIN) {
      throw new ForbiddenException('Only admin can delete projects');
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId, isActive: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    await this.prisma.project.update({
      where: { id: projectId },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { message: 'Project deleted successfully' };
  }

  async getProjectsDropdown(companyId: string) {
    return this.prisma.project.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, product: true },
      orderBy: { name: 'asc' },
    });
  }
}