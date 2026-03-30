// ============================================================
// src/modules/hierarchy/hierarchy.controller.ts
// ============================================================
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { HierarchyService } from './hierarchy.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyId } from '../../common/decorators/company.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Designation } from '@prisma/client';
 
@ApiTags('hierarchy')
@ApiBearerAuth()
@Controller('hierarchy')
export class HierarchyController {
  constructor(private readonly hierarchyService: HierarchyService) {}
 
  // ── GET /hierarchy/tree
  // Returns the full company hierarchy as a nested tree
  // Read-only, visible to all employees
  @Get('tree')
  @ApiOperation({ summary: 'Get full hierarchy tree (read only)' })
  getTree(@CompanyId() companyId: string) {
    return this.hierarchyService.getHierarchyTree(companyId);
  }
 
  // ── GET /hierarchy/employees
  // Returns flat list of employees scoped to the requesting user's hierarchy
  // Used for dropdowns (assign lead, view staff, etc.)
  @Get('employees')
  @ApiOperation({ summary: 'List employees within your hierarchy scope' })
  listEmployees(
    @CompanyId() companyId: string,
    @CurrentUser('employeeId') employeeId: string,
    @CurrentUser('designation') designation: Designation,
  ) {
    return this.hierarchyService.listEmployees(companyId, employeeId, designation);
  }
 
  // ── GET /hierarchy/employees/:id
  @Get('employees/:id')
  @ApiOperation({ summary: 'Get a single employee by ID' })
  getEmployee(
    @CompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.hierarchyService.getEmployeeById(companyId, id);
  }
 
  // ── POST /hierarchy/employees
  // Admin only — create a new employee
  @Post('employees')
  @Roles(Designation.ADMIN)
  @ApiOperation({ summary: 'Add a new employee (admin only)' })
  createEmployee(
    @CompanyId() companyId: string,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.hierarchyService.createEmployee(companyId, dto);
  }
 
  // ── PATCH /hierarchy/employees/:id
  // Admin only — update employee details, designation, or reporting manager
  @Patch('employees/:id')
  @Roles(Designation.ADMIN)
  @ApiOperation({ summary: 'Update employee (admin only)' })
  updateEmployee(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.hierarchyService.updateEmployee(companyId, id, dto);
  }
 
  // ── PATCH /hierarchy/employees/:id/deactivate
  // Admin only — soft delete employee, transfer leads to manager
  @Patch('employees/:id/deactivate')
  @Roles(Designation.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate employee and transfer leads (admin only)' })
  deactivateEmployee(
    @CompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.hierarchyService.deactivateEmployee(companyId, id);
  }
 
  // ── PATCH /hierarchy/employees/:id/reactivate
  @Patch('employees/:id/reactivate')
  @Roles(Designation.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a previously deactivated employee (admin only)' })
  reactivateEmployee(
    @CompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.hierarchyService.reactivateEmployee(companyId, id);
  }
 
  // ── GET /hierarchy/scope-ids
  // Returns the list of employee IDs the current user can access
  // Useful for the frontend to know which users are in scope
  @Get('scope-ids')
  @ApiOperation({ summary: 'Get employee IDs in your hierarchy scope' })
  getScopeIds(
    @CompanyId() companyId: string,
    @CurrentUser('employeeId') employeeId: string,
    @CurrentUser('designation') designation: Designation,
  ) {
    return this.hierarchyService.getScopeEmployeeIds(companyId, employeeId, designation);
  }
}