import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Designation, ExpenseCategory, ExpenseSubCategory } from '@prisma/client';
import { IsEnum, IsString, IsNumber, IsOptional, IsDateString, IsUrl } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateExpenseDto {
  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @IsEnum(ExpenseSubCategory)
  subCategory: ExpenseSubCategory;

  @IsString()
  title: string;

  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  receiptUrl?: string;

  @IsDateString()
  @Transform(({ value }) => {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) return date.toISOString();
    }
    return value;
  })
  expenseDate: Date;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsEnum(ExpenseSubCategory)
  subCategory?: ExpenseSubCategory;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  receiptUrl?: string;

  @IsOptional()
  @IsDateString()
  expenseDate?: Date;
}

export class ListExpensesDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsEnum(ExpenseSubCategory)
  subCategory?: ExpenseSubCategory;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;
}

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  async createExpense(
    companyId: string,
    employeeId: string,
    dto: CreateExpenseDto,
    designation: Designation,
    canAddExpenses: boolean,
  ) {
    if (designation !== Designation.ADMIN && !canAddExpenses) {
      throw new ForbiddenException('Not authorized to add expenses');
    }
    return this.prisma.expense.create({
      data: { companyId, createdById: employeeId, ...dto },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async getExpenses(
    companyId: string,
    employeeId: string,
    designation: Designation,
    subordinateIds: string[],
    dto: ListExpensesDto,
  ) {
    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(100, dto.limit ?? 20);
    const skip = (page - 1) * limit;

    const isAdmin = designation === Designation.ADMIN;

    const scopeIds = isAdmin
      ? null
      : designation === Designation.SALES_EXECUTIVE
      ? [employeeId]
      : [employeeId, ...subordinateIds];

    const where: any = {
      companyId,
      ...(scopeIds ? { createdById: { in: scopeIds } } : {}),
      ...(dto.category ? { category: dto.category } : {}),
      ...(dto.subCategory ? { subCategory: dto.subCategory } : {}),
      ...(dto.employeeId && isAdmin ? { createdById: dto.employeeId } : {}),
      ...(dto.startDate || dto.endDate
        ? {
            expenseDate: {
              ...(dto.startDate ? { gte: new Date(dto.startDate) } : {}),
              ...(dto.endDate ? { lte: new Date(dto.endDate) } : {}),
            },
          }
        : {}),
    };

    const [total, data, totalAmount] = await Promise.all([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        skip,
        take: limit,
        orderBy: { expenseDate: 'desc' },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, designation: true },
          },
        },
      }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalAmount: totalAmount._sum.amount ?? 0,
      },
    };
  }

  async getExpenseById(companyId: string, expenseId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, companyId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async updateExpense(
    companyId: string,
    expenseId: string,
    employeeId: string,
    dto: UpdateExpenseDto,
    designation: Designation,
  ) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, companyId },
    });
    if (!expense) throw new NotFoundException('Expense not found');

    if (designation !== Designation.ADMIN && expense.createdById !== employeeId) {
      throw new ForbiddenException('Not authorized to update this expense');
    }
    return this.prisma.expense.update({ where: { id: expenseId }, data: dto });
  }

  async deleteExpense(
    companyId: string,
    expenseId: string,
    employeeId: string,
    designation: Designation,
  ) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, companyId },
    });
    if (!expense) throw new NotFoundException('Expense not found');

    if (designation !== Designation.ADMIN && expense.createdById !== employeeId) {
      throw new ForbiddenException('Not authorized to delete this expense');
    }
    await this.prisma.expense.delete({ where: { id: expenseId } });
    return { message: 'Expense deleted' };
  }
}