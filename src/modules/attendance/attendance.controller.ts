import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AttendanceService,
  CheckInDto,
  CheckOutDto,
  ListAttendanceDto,
  MarkAttendanceDto,
} from './attendance.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  // ── Employee self-service ────────────────────────────────

  @Post('check-in')
  @ApiOperation({ summary: 'Employee check-in with GPS coordinates' })
  checkIn(@CurrentUser() user: any, @Body() dto: CheckInDto) {
    return this.attendanceService.checkIn(user.companyId, user.employeeId, dto);
  }

  @Post('check-out')
  @ApiOperation({ summary: 'Employee check-out with GPS coordinates' })
  checkOut(@CurrentUser() user: any, @Body() dto: CheckOutDto) {
    return this.attendanceService.checkOut(user.companyId, user.employeeId, dto);
  }

  @Get('today')
  @ApiOperation({ summary: "Get today's check-in/out status" })
  getTodayStatus(@CurrentUser('employeeId') employeeId: string) {
    return this.attendanceService.getTodayStatus(employeeId);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Get my attendance history' })
  getMyAttendance(
    @CurrentUser('employeeId') employeeId: string,
    @Query() query: ListAttendanceDto,
  ) {
    return this.attendanceService.getMyAttendance(employeeId, query);
  }

  // ── Manager / Admin views ────────────────────────────────

  @Get('summary')
  @ApiOperation({ summary: 'Get monthly attendance summary for team' })
  getMonthlySummary(
    @CurrentUser() user: any,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    const now = new Date();
    return this.attendanceService.getMonthlySummary(
      user.companyId,
      user.employeeId,
      user.designation,
      user.subordinateIds,
      user.permissions.canViewAllAttendance,
      month ? Number(month) : now.getMonth() + 1,
      year  ? Number(year)  : now.getFullYear(),
    );
  }

  @Get('export/mine')
  @ApiOperation({ summary: 'Export my own attendance as Excel' })
  async exportMine(
    @CurrentUser() user: any,
    @Query() query: ListAttendanceDto,
    @Res() res: Response,
  ) {
    const buffer = await this.attendanceService.exportAttendance(
      user.companyId,
      user.employeeId,
      user.designation,
      [],
      false,
      query,
      user.employeeId,           // scope to self only
    );

    const month = query.startDate
      ? new Date(query.startDate)
          .toLocaleString('en-IN', { month: 'long', year: 'numeric' })
          .replace(' ', '_')
      : 'report';

    res.set({
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="My_Attendance_${month}.xlsx"`,
      'Content-Length':      buffer.length,
    });
    res.end(buffer);
  }

  @Get('export/team')
  @ApiOperation({ summary: 'Export team attendance as Excel (scoped by hierarchy)' })
  async exportTeam(
    @CurrentUser() user: any,
    @Query() query: ListAttendanceDto,
    @Query('employeeId') targetEmployeeId: string | undefined,
    @Res() res: Response,
  ) {
    const buffer = await this.attendanceService.exportAttendance(
      user.companyId,
      user.employeeId,
      user.designation,
      user.subordinateIds,
      user.permissions.canViewAllAttendance,
      query,
      targetEmployeeId,          // undefined = all scoped, string = single employee
    );

    const month = query.startDate
      ? new Date(query.startDate)
          .toLocaleString('en-IN', { month: 'long', year: 'numeric' })
          .replace(' ', '_')
      : 'report';

    const label = targetEmployeeId ? `Employee_${targetEmployeeId}` : 'Team';

    res.set({
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${label}_Attendance_${month}.xlsx"`,
      'Content-Length':      buffer.length,
    });
    res.end(buffer);
  }

  // NOTE: Keep @Get() last — catch-all route must come after specific routes
  @Get()
  @ApiOperation({ summary: 'Get team attendance (scoped by hierarchy)' })
  getAttendance(@CurrentUser() user: any, @Query() query: ListAttendanceDto) {
    return this.attendanceService.getAttendance(
      user.companyId,
      user.employeeId,
      user.designation,
      user.subordinateIds,
      user.permissions.canViewAllAttendance,
      query,
    );
  }

  @Post('mark')
  @ApiOperation({ summary: 'Admin: manually mark attendance for an employee' })
  markAttendance(@CurrentUser() user: any, @Body() dto: MarkAttendanceDto) {
    return this.attendanceService.markAttendance(
      user.companyId,
      dto,
      user.designation,
      user.permissions.canViewAllAttendance,
    );
  }
}