// ============================================================
// src/modules/leads/leads.controller.ts
// ============================================================
// Changes vs original:
//   1. addQuery now passes `user.designation` to service (was only employeeId)
//   2. Two new endpoints added:
//        PATCH /:id/queries/:queryId   — edit a query
//        POST  /:id/queries/:queryId/remarks — add remark to existing query
//   3. Imports UpdateQueryDto and CreateRemarkDto
// ============================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LeadsService, QueryTabFilterDto } from './leads.service';
import {
  CreateLeadDto,
  UpdateLeadDto,
  CreateQueryDto,
  UpdateQueryDto,
  CreateRemarkDto,
  LeadFilterDto,
} from './dto/create-lead.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyId } from '../../common/decorators/company.decorator';
import { LeadStatus, LeadType } from '@prisma/client';

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a single lead' })
  createLead(
    @CompanyId() companyId: string,
    @CurrentUser('employeeId') employeeId: string,
    @Body() dto: CreateLeadDto,
  ) {
    return this.leadsService.createLead(companyId, employeeId, dto);
  }

  @Get('tab-counts')
  @ApiOperation({ summary: 'Get counts for all tabs' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'assignedToId', required: false })
  getTabCounts(
    @CompanyId() companyId: string,
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('assignedToId') assignedToId?: string,
  ) {
    return this.leadsService.getTabCounts(companyId, user, search, assignedToId);
  }

  @Get('tab/fresh')
  @ApiOperation({ summary: 'Fresh tab' })
  getFreshLeads(
    @CompanyId() companyId: string,
    @CurrentUser() user: any,
    @Query() filter: QueryTabFilterDto,
  ) {
    return this.leadsService.getFreshLeads(companyId, user, filter);
  }

  @Get('tab/:status')
  @ApiOperation({ summary: 'Query tab — returns queries matching this status' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'assignedToId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  getQueryTab(
    @CompanyId() companyId: string,
    @CurrentUser() user: any,
    @Param('status') status: LeadStatus,
    @Query() filter: QueryTabFilterDto,
  ) {
    return this.leadsService.getQueryTab(companyId, user, { ...filter, callStatus: status });
  }

  @Get('todays-followups')
  @ApiOperation({ summary: "Today's follow-up queries" })
  getTodaysFollowups(
    @CompanyId() companyId: string,
    @CurrentUser('employeeId') employeeId: string,
  ) {
    return this.leadsService.getTodaysFollowups(companyId, employeeId);
  }

  @Get('notification-strip')
  @ApiOperation({ summary: 'Homepage notification strip data' })
  getNotificationStrip(@CompanyId() companyId: string, @CurrentUser() user: any) {
    return this.leadsService.getNotificationStripData(companyId, user);
  }

  @Get()
  @ApiOperation({ summary: 'Global lead search' })
  @ApiQuery({ name: 'status', required: false, enum: LeadStatus })
  @ApiQuery({ name: 'type', required: false, enum: LeadType })
  @ApiQuery({ name: 'search', required: false })
  getLeads(
    @CompanyId() companyId: string,
    @CurrentUser() user: any,
    @Query() filter: LeadFilterDto,
  ) {
    return this.leadsService.getLeads(companyId, user, filter);
  }

  @Get('find-tab')
  @ApiOperation({ summary: 'Find which tab a searched lead lives in' })
  @ApiQuery({ name: 'search', required: true })
  @ApiQuery({ name: 'assignedToId', required: false })
  findLeadTab(
    @CompanyId() companyId: string,
    @CurrentUser() user: any,
    @Query('search') search: string,
    @Query('assignedToId') assignedToId?: string,   // ← ADD
  ) {
    return this.leadsService.findLeadTab(companyId, user, search, assignedToId);
  }

  @Get('all')
@ApiOperation({ summary: 'Get all leads with filters — for New Leads view' })
getAllLeads(
  @CompanyId() companyId: string,
  @CurrentUser() user: any,
  @Query() filter: QueryTabFilterDto & { createdById?: string },
) {
  return this.leadsService.getAllLeads(companyId, user, filter);
}

  @Post('trigger-special-notifications')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Admin: manually trigger birthday/anniversary notifications' })
async triggerSpecialNotifications(@CurrentUser() user: any) {
  if (user.designation !== 'ADMIN') {
    throw new ForbiddenException('Admin only');
  }
  await this.leadsService.sendSpecialDayNotifications();
  return { success: true, message: 'Triggered' };
}

  @Get('today-celebrations')
@ApiOperation({ summary: 'Get today lead client birthdays/anniversaries for assigned employee' })
getTodayCelebrations(
  @CompanyId() companyId: string,
  @CurrentUser('employeeId') employeeId: string,
) {
  return this.leadsService.getTodayCelebrations(companyId, employeeId);
}

  @Get(':id')
  @ApiOperation({ summary: 'Get lead detail with all queries and remarks' })
  getLeadById(
    @CompanyId() companyId: string,
    @CurrentUser('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    return this.leadsService.getLeadById(companyId, id, employeeId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update lead details' })
  updateLead(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadsService.updateLead(companyId, id, dto);
  }

  // CHANGED: was @CurrentUser('employeeId') — now needs full user for designation
  @Post(':id/queries')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a new query to a lead' })
  addQuery(
    @CompanyId() companyId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateQueryDto,
  ) {
    return this.leadsService.addQuery(companyId, id, user.employeeId, dto, user.designation);
  }

  // NEW endpoint
  @Patch(':id/queries/:queryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edit an existing query (admin or creator only)' })
  updateQuery(
    @CompanyId() companyId: string,
    @CurrentUser() user: any,
    @Param('id') leadId: string,
    @Param('queryId') queryId: string,
    @Body() dto: UpdateQueryDto,
  ) {
    return this.leadsService.updateQuery(
      companyId, leadId, queryId, user.employeeId, dto, user.designation,
    );
  }

  // NEW endpoint
  @Post(':id/queries/:queryId/remarks')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a remark to an existing query' })
  addRemark(
    @CompanyId() companyId: string,
    @CurrentUser('employeeId') employeeId: string,
    @Param('id') leadId: string,
    @Param('queryId') queryId: string,
    @Body() dto: CreateRemarkDto,
  ) {
    return this.leadsService.addRemark(companyId, leadId, queryId, employeeId, dto);
  }

  @Post(':id/request-permission')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request admin permission to add another query' })
  requestPermission(
    @CompanyId() companyId: string,
    @CurrentUser('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    return this.leadsService.requestQueryPermission(companyId, id, employeeId);
  }

  @Get('permissions/pending')
  @ApiOperation({ summary: 'Admin: list pending permission requests' })
  getPendingPermissions(
    @CompanyId() companyId: string,
    @CurrentUser() user: any,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.leadsService.getPendingPermissionRequests(
      companyId, user.designation, Number(page), Number(limit),
    );
  }

  @Patch('permissions/:requestId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: approve or reject a permission request' })
  actOnPermission(
    @CompanyId() companyId: string,
    @CurrentUser() user: any,
    @Param('requestId') requestId: string,
    @Body() dto: { approve: boolean; rejectionNote?: string },
  ) {
    return this.leadsService.approveQueryPermission(
      companyId, requestId, user.employeeId, user.designation, dto.approve, dto.rejectionNote,
    );
  }

  @Patch(':id/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign lead to employee' })
  assignLead(
    @CompanyId() companyId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('assignedToId') assignedToId: string,
  ) {
    return this.leadsService.assignLead(companyId, id, assignedToId, user);
  }

  @Post('bulk-assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk assign leads' })
  bulkAssign(
    @CompanyId() companyId: string,
    @CurrentUser() user: any,
    @Body() dto: { leadIds: string[]; assignedToId: string },
  ) {
    return this.leadsService.bulkAssign(companyId, dto.leadIds, dto.assignedToId, user);
  }

  @Patch(':id/delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete a lead' })
  deleteLead(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.leadsService.deleteLead(companyId, id);
  }
}