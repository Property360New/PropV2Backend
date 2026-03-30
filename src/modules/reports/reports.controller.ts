import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { ReportsService, ReportFilterDto } from './reports.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
// ── ValidationPipe with transform:true is REQUIRED ───────────────────────────
// Without this, the @Transform() decorators on ReportFilterDto never run,
// so dto.startDate / dto.employeeId / dto.month are always undefined —
// causing the service to always fall back to the current month range
// and ignore any employeeId filter.
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: any) {
    return this.reportsService.getDashboardSummary(
      user.companyId, user.employeeId, user.designation, user.subordinateIds,
    );
  }

  @Get('activity')
  @ApiOperation({ summary: 'Full activity stats: calls, followups, visits, meetings, deals + hourly histogram' })
  getActivity(@CurrentUser() user: any, @Query() query: ReportFilterDto) {
    return this.reportsService.getActivityStats(
      user.companyId, user.employeeId, user.designation, user.subordinateIds, query,
    );
  }

  @Get('team/performance')
  getTeamPerformance(@CurrentUser() user: any, @Query() query: ReportFilterDto) {
    return this.reportsService.getTeamPerformanceReport(
      user.companyId, user.employeeId, user.designation, user.subordinateIds, query,
    );
  }

  @Get('leads/status')
  getLeadStatus(@CurrentUser() user: any, @Query() query: ReportFilterDto) {
    return this.reportsService.getLeadStatusReport(
      user.companyId, user.employeeId, user.designation, user.subordinateIds, query,
    );
  }

  @Get('leads/source')
  getLeadSource(@CurrentUser() user: any, @Query() query: ReportFilterDto) {
    return this.reportsService.getLeadSourceReport(
      user.companyId, user.employeeId, user.designation, user.subordinateIds, query,
    );
  }

  @Get('deals')
  getDeals(@CurrentUser() user: any, @Query() query: ReportFilterDto) {
    return this.reportsService.getDealsReport(
      user.companyId, user.employeeId, user.designation, user.subordinateIds, query,
    );
  }

  @Get('call-activity')
  getCallActivity(@CurrentUser() user: any, @Query() query: ReportFilterDto) {
    return this.reportsService.getCallActivityReport(
      user.companyId, user.employeeId, user.designation, user.subordinateIds, query,
    );
  }

  @Get('daily-call-activity')
  @ApiOperation({ summary: 'Daily call activity for KRA calendar — calls per day in a month' })
  getDailyCallActivity(@CurrentUser() user: any, @Query() query: ReportFilterDto) {
    return this.reportsService.getDailyCallActivityReport(user.companyId, user.employeeId, user.designation, user.subordinateIds, query);
  }

  @Get('attendance')
  getAttendance(@CurrentUser() user: any, @Query() query: ReportFilterDto) {
    return this.reportsService.getAttendanceReport(
      user.companyId, user.employeeId, user.designation, user.subordinateIds, query,
    );
  }

  @Get('expenses')
  getExpenses(@CurrentUser() user: any, @Query() query: ReportFilterDto) {
    return this.reportsService.getExpenseReport(
      user.companyId, user.employeeId, user.designation, user.subordinateIds, query,
    );
  }
}