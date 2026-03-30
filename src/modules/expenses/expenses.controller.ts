import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ExpensesService, CreateExpenseDto, UpdateExpenseDto, ListExpensesDto } from './expenses.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private expensesService: ExpensesService) {}

  @Post()
  @ApiOperation({ summary: 'Log an expense' })
  create(@CurrentUser() user: any, @Body() dto: CreateExpenseDto) {
    return this.expensesService.createExpense(
      user.companyId, user.employeeId, dto, user.designation, user.permissions.canAddExpenses,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List expenses (scoped by hierarchy)' })
  getAll(@CurrentUser() user: any, @Query() query: ListExpensesDto) {
    return this.expensesService.getExpenses(
      user.companyId, user.employeeId, user.designation, user.subordinateIds, query,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get expense by ID' })
  getById(@CurrentUser('companyId') companyId: string, @Param('id') id: string) {
    return this.expensesService.getExpenseById(companyId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update expense (own or admin)' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expensesService.updateExpense(
      user.companyId, id, user.employeeId, dto, user.designation,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete expense (own or admin)' })
  delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.expensesService.deleteExpense(
      user.companyId, id, user.employeeId, user.designation,
    );
  }
}