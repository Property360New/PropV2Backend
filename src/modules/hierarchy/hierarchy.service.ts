// src/modules/hierarchy/hierarchy.service.ts

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Designation, EmployeeStatus, Prisma } from '@prisma/client';
import { getAllSubordinateIds } from '../../common/utils/hierarchy.util';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

const DESIGNATION_LEVEL: Record<Designation, number> = {
  SALES_EXECUTIVE:  1,
  TEAM_LEAD:        2,
  SALES_MANAGER:    3,
  AREA_MANAGER:     4,
  DGM:              5,
  GM:               6,
  SALES_COORDINATOR:7,
  VP_SALES:         7,
  ADMIN:            99,
};

@Injectable()
export class HierarchyService {
  private readonly logger = new Logger(HierarchyService.name);

  constructor(private prisma: PrismaService) {}

  // ── Add Employee ─────────────────────────────────────────────────────────────
  async createEmployee(companyId: string, dto: CreateEmployeeDto) {
    let reportingManagerId: string | null = null;
    if (dto.reportingManagerId) {
      const manager = await this.prisma.employee.findFirst({
        where: { id: dto.reportingManagerId, companyId, isActive: true },
      });
      if (!manager) throw new NotFoundException('Reporting manager not found');

      if (
        DESIGNATION_LEVEL[manager.designation] <=
        DESIGNATION_LEVEL[dto.designation as Designation]
      ) {
        throw new BadRequestException(
          `Reporting manager (${manager.designation}) must be senior to new employee (${dto.designation})`,
        );
      }
      reportingManagerId = manager.id;
    }

    const { email, password, ...employeeData } = dto;
    const hashedPassword = await this.hashPassword(password);

    const newEmployee = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          employee: {
            create: {
              companyId,
              firstName: employeeData.firstName,
              lastName: employeeData.lastName,
              phone: employeeData.phone,
              designation: employeeData.designation as Designation,
              aadhaarNumber: employeeData.aadhaarNumber ?? null,
panNumber: employeeData.panNumber ?? null,
emergencyContact: employeeData.emergencyContact ?? null,
employeeType: employeeData.employeeType ?? 'EMPLOYEE',
              reportingManagerId,
              birthday: employeeData.birthday ? new Date(employeeData.birthday) : null,
              marriageAnniversary: employeeData.marriageAnniversary
                ? new Date(employeeData.marriageAnniversary)
                : null,
              dailyCallTarget: employeeData.dailyCallTarget,
              monthlySalesTarget: employeeData.monthlySalesTarget,
              canViewAllFreshLeads:
                employeeData.designation === 'SALES_COORDINATOR' || false,
              canEditInventory:
                employeeData.designation === 'SALES_COORDINATOR' || false,
              canAddExpenses:
                employeeData.designation === 'SALES_COORDINATOR' || false,
              canManageEmployees:
                employeeData.designation === 'SALES_COORDINATOR' || false,
              canViewAllAttendance:
                employeeData.designation === 'SALES_COORDINATOR' || false,
            },
          },
        },
        include: { employee: true },
      });
      return user.employee!;
    });

    await this.rebuildSubordinateIdsForAncestors(companyId, reportingManagerId);
    this.logger.log(`Employee created: ${newEmployee.id} (${dto.designation})`);
    return newEmployee;
  }

  // ── Update Employee ───────────────────────────────────────────────────────────
  async updateEmployee(
    companyId: string,
    employeeId: string,
    dto: UpdateEmployeeDto,
  ) {
    const existing = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
    });
    if (!existing) throw new NotFoundException('Employee not found');

    // ── FIX: Guard against designation downgrade when direct reports exist ──────
    //
    // If the designation is being changed, check whether any currently active
    // direct reports (employees whose reportingManagerId === this employee's id)
    // would become equal to or more senior than the new designation.
    //
    // Example: Rahul is TEAM_LEAD (level 2) with two SALES_EXECUTIVE (level 1)
    // direct reports. Downgrading Rahul to SALES_EXECUTIVE (level 1) would put
    // him at the same level — that is invalid and must be blocked.
    if (dto.designation && dto.designation !== existing.designation) {
      const newLevel = DESIGNATION_LEVEL[dto.designation as Designation] ?? 0;

      const directReports = await this.prisma.employee.findMany({
        where: {
          reportingManagerId: employeeId,
          isActive: true,
          companyId,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          designation: true,
        },
      });

      // Find any direct report whose level would be >= the new designation level
      const blockers = directReports.filter((dr) => {
        const drLevel = DESIGNATION_LEVEL[dr.designation as Designation] ?? 0;
        return drLevel >= newLevel;
      });

      if (blockers.length > 0) {
        const names = blockers
          .map((b) => `${b.firstName} ${b.lastName ?? ''} (${b.designation.replace(/_/g, ' ')})`)
          .join(', ');
        throw new BadRequestException(
          `Cannot change designation to ${dto.designation}: the following direct reports ` +
          `would be at the same level or more senior. ` +
          `Please reassign them first: ${names}`,
        );
      }
    }

    // ── Guard against circular hierarchy ─────────────────────────────────────
    const hierarchyChanged =
      dto.reportingManagerId !== undefined &&
      dto.reportingManagerId !== existing.reportingManagerId;

    if (hierarchyChanged && dto.reportingManagerId) {
      const newManagerSubordinates =
        (
          await this.prisma.employee.findUnique({
            where: { id: dto.reportingManagerId },
            select: { subordinateIds: true },
          })
        )?.subordinateIds ?? [];

      if (newManagerSubordinates.includes(employeeId)) {
        throw new BadRequestException(
          'Cannot create circular hierarchy: new manager is a subordinate of this employee',
        );
      }

      // Also validate new manager is senior enough
      if (dto.designation || existing.designation) {
        const empDesig = (dto.designation ?? existing.designation) as Designation;
        const newManager = await this.prisma.employee.findUnique({
          where: { id: dto.reportingManagerId },
          select: { designation: true },
        });
        if (newManager) {
          const mgrLevel = DESIGNATION_LEVEL[newManager.designation as Designation] ?? 0;
          const empLevel = DESIGNATION_LEVEL[empDesig] ?? 0;
          if (mgrLevel <= empLevel) {
            throw new BadRequestException(
              `Reporting manager (${newManager.designation}) must be senior to the employee (${empDesig})`,
            );
          }
        }
      }
    }

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(dto.firstName     && { firstName: dto.firstName }),
        ...(dto.lastName      !== undefined && { lastName: dto.lastName }),
        ...(dto.phone         !== undefined && { phone: dto.phone }),
        ...(dto.designation   && { designation: dto.designation as Designation }),
        ...(dto.reportingManagerId !== undefined && {
          reportingManagerId: dto.reportingManagerId,
        }),
        ...(dto.birthday            !== undefined && { birthday: dto.birthday }),
        ...(dto.marriageAnniversary !== undefined && {
          marriageAnniversary: dto.marriageAnniversary,
        }),
        ...(dto.dailyCallTarget     !== undefined && {
          dailyCallTarget: dto.dailyCallTarget,
        }),
        ...(dto.monthlySalesTarget  !== undefined && {
          monthlySalesTarget: dto.monthlySalesTarget,
        }),
        ...(dto.aadhaarNumber  !== undefined && { aadhaarNumber: dto.aadhaarNumber }),
...(dto.panNumber      !== undefined && { panNumber: dto.panNumber }),
...(dto.emergencyContact !== undefined && { emergencyContact: dto.emergencyContact }),
...(dto.employeeType   !== undefined && { employeeType: dto.employeeType }),
      },
    });

    if (hierarchyChanged) {
      await this.rebuildSubordinateIdsForAncestors(companyId, null);
    }

    return this.getEmployee(companyId, employeeId);
  }

  // ── Deactivate Employee ───────────────────────────────────────────────────────
  async deactivateEmployee(companyId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
      include: { reportingManager: { select: { id: true } } },
    });

    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.designation === 'ADMIN') {
      throw new BadRequestException('Cannot deactivate admin');
    }

    const managerId = employee.reportingManagerId;

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employeeId },
        data: {
          isActive: false,
          status: EmployeeStatus.INACTIVE,
          leftAt: new Date(),
          deletedAt: new Date(),
        },
      });

      await tx.user.update({
        where: { id: employee.userId },
        data: { isActive: false },
      });

      if (managerId) {
        await tx.lead.updateMany({
          where: { assignedToId: employeeId, isActive: true },
          data: {
            assignedToId: managerId,
            assignedAt: new Date(),
            lastActivityAt: new Date(),
          },
        });
        this.logger.log(`Leads transferred from ${employeeId} to manager ${managerId}`);
      }
    });

    await this.rebuildSubordinateIdsForAncestors(companyId, null);
    return { success: true, message: 'Employee deactivated and leads transferred' };
  }

  // ── Reactivate Employee ───────────────────────────────────────────────────────
  async reactivateEmployee(companyId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employeeId },
        data: { isActive: true, status: EmployeeStatus.ACTIVE, deletedAt: null, leftAt: null },
      });
      await tx.user.update({
        where: { id: employee.userId },
        data: { isActive: true },
      });
    });

    await this.rebuildSubordinateIdsForAncestors(companyId, null);
    return { success: true };
  }

  // ── Hierarchy Tree ────────────────────────────────────────────────────────────
  async getHierarchyTree(companyId: string) {
    const allEmployees = await this.prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        designation: true,
        avatar: true,
        reportingManagerId: true,
        dailyCallTarget: true,
        monthlySalesTarget: true,
      },
      orderBy: [{ designation: 'asc' }, { firstName: 'asc' }],
    });

    const employeeMap = new Map(
      allEmployees.map((e) => [e.id, { ...e, children: [] as any[] }]),
    );
    const roots: any[] = [];

    for (const emp of allEmployees) {
      if (!emp.reportingManagerId) {
        roots.push(employeeMap.get(emp.id)!);
      } else {
        const parent = employeeMap.get(emp.reportingManagerId);
        if (parent) {
          parent.children.push(employeeMap.get(emp.id)!);
        } else {
          roots.push(employeeMap.get(emp.id)!);
        }
      }
    }

    return roots;
  }

  // ── Scope Employee IDs ────────────────────────────────────────────────────────
  async getScopeEmployeeIds(
    companyId: string,
    employeeId: string,
    designation: Designation,
  ): Promise<string[] | null> {
    if (designation === 'ADMIN') return null;

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { subordinateIds: true },
    });

    return [employeeId, ...(employee?.subordinateIds ?? [])];
  }

  // ── List Employees ────────────────────────────────────────────────────────────
  async listEmployees(
    companyId: string,
    requestingEmployeeId: string,
    designation: Designation,
  ) {
    const scopeIds = await this.getScopeEmployeeIds(
      companyId,
      requestingEmployeeId,
      designation,
    );

    return this.prisma.employee.findMany({
      where: {
        companyId,
        isActive: true,
        ...(scopeIds ? { id: { in: scopeIds } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        designation: true,
        avatar: true,
        reportingManagerId: true,
        dailyCallTarget: true,
        user: { select: { email: true } },
      },
      orderBy: [{ designation: 'asc' }, { firstName: 'asc' }],
    });
  }

  // ── Rebuild subordinateIds ────────────────────────────────────────────────────
  async rebuildSubordinateIdsForAncestors(
    companyId: string,
    startFromId: string | null,
  ) {
    const allEmployees = await this.prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: { id: true, reportingManagerId: true },
    });

    const updates: Promise<any>[] = [];
    for (const emp of allEmployees) {
      const subIds = getAllSubordinateIds(emp.id, allEmployees);
      updates.push(
        this.prisma.employee.update({
          where: { id: emp.id },
          data: { subordinateIds: subIds },
        }),
      );
    }

    await Promise.all(updates);
    this.logger.log(
      `Rebuilt subordinateIds for ${updates.length} employees in company ${companyId}`,
    );
  }

  async getEmployeeById(companyId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      include: {
        user: { select: { email: true, isActive: true, lastLoginAt: true } },
        reportingManager: {
          select: { id: true, firstName: true, lastName: true, designation: true },
        },
        subordinates: {
          where: { isActive: true },
          select: { id: true, firstName: true, lastName: true, designation: true },
        },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  private async getEmployee(companyId: string, employeeId: string) {
    return this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      include: {
        user: { select: { email: true, isActive: true } },
        reportingManager: {
          select: { id: true, firstName: true, lastName: true, designation: true },
        },
      },
    });
  }

  private async hashPassword(password: string): Promise<string> {
    const bcrypt = await import('bcrypt');
    return bcrypt.hash(password, 12);
  }
}