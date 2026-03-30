import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { TargetsService, SetTargetDto, GetTargetsDto } from './targets.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';

@ApiTags('targets')
@ApiBearerAuth()
@Controller('targets')
export class TargetsController {
  constructor(private targetsService: TargetsService) {}

  // ── Admin: set target ────────────────────────────────────────────────────────
  @Post('set')
  setTarget(@CurrentUser() user: any, @Body() dto: SetTargetDto) {
    return this.targetsService.setTarget(user.companyId, dto, user.designation);
  }

  // ── Single month — my target ─────────────────────────────────────────────────
  @Get('mine')
  getMyTarget(
    @CurrentUser() user: any,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.targetsService.getMyTarget(user.companyId, user.employeeId, month, year);
  }

  // ── Team targets for a month/year ────────────────────────────────────────────
  // Response includes quarterlyIncentives per row.
  @Get('team')
  getTeam(@CurrentUser() user: any, @Query() query: GetTargetsDto) {
    return this.targetsService.getTeamTargets(
      user.companyId, user.employeeId, user.designation, user.subordinateIds, query,
    );
  }

  // ── Multi-month series for trend graphs ──────────────────────────────────────
  @Get('series/mine')
  getMySeries(
    @CurrentUser() user: any,
    @Query('months') months: number,
    @Query('employeeId') employeeId?: string,
  ) {
    const targetId = employeeId || user.employeeId;
    return this.targetsService.getMyTargetSeries(user.companyId, targetId, months);
  }

  // ── Period summary with optional month/year anchor ───────────────────────────
  // Also returns quarterlyIncentives for the given year in the same response.
  @Get('summary')
  @ApiOperation({ summary: 'Period summary — calls, deals, revenue, incentive + quarterly breakdown' })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'period',     required: true,  enum: ['1M', '3M', '6M', '1Y'] })
  @ApiQuery({ name: 'month',      required: false, description: 'Anchor month (1–12). Defaults to current.' })
  @ApiQuery({ name: 'year',       required: false, description: 'Anchor year. Defaults to current.' })
  getSummary(
    @CurrentUser() user: any,
    @Query('employeeId') employeeId: string,
    @Query('period')     period: '1M' | '3M' | '6M' | '1Y',
    @Query('month')      month: number,
    @Query('year')       year: number,
  ) {
    const targetId = employeeId || user.employeeId;
    return this.targetsService.getSummary(
      user.companyId,
      user,
      targetId,
      period || '1M',
      month  ? Number(month)  : undefined,
      year   ? Number(year)   : undefined,
    );
  }

  // ── Today's live stats ───────────────────────────────────────────────────────
  @Get('today')
  @ApiOperation({ summary: "Today's live stats (queries + remarks counted as calls)" })
  getTodayStats(
    @CurrentUser() user: any,
    @Query('employeeId') employeeId: string,
  ) {
    const targetId = employeeId || user.employeeId;
    return this.targetsService.getTodayStats(user.companyId, targetId);
  }

  // ── Quarterly incentive breakdown for a full year ────────────────────────────
  @Get('quarterly-incentives')
  @ApiOperation({ summary: 'Quarterly incentive breakdown — Q1(JFM) Q2(AMJ) Q3(JAS) Q4(OND)' })
  @ApiQuery({ name: 'employeeId', required: true  })
  @ApiQuery({ name: 'year',       required: true  })
  getQuarterlyIncentives(
    @CurrentUser() user: any,
    @Query('employeeId') employeeId: string,
    @Query('year')       year: number,
  ) {
    // Security: only self or admin/manager can query
    const targetId = employeeId || user.employeeId;
    return this.targetsService.getQuarterlyIncentives(
      user.companyId,
      targetId,
      Number(year) || new Date().getFullYear(),
    );
  }
}