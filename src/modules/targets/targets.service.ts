import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Designation } from '@prisma/client';

export class SetTargetDto {
  employeeId: string;
  month: number;
  year: number;
  callTarget?: number;
  salesTarget?: number;
}

export class GetTargetsDto {
  month?: number;
  year?: number;
  employeeId?: string;
}

// ─── Quarter definitions ──────────────────────────────────────────────────────

const QUARTERS: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number[]> = {
  Q1: [1, 2, 3],   // JFM — Jan, Feb, Mar
  Q2: [4, 5, 6],   // AMJ — Apr, May, Jun
  Q3: [7, 8, 9],   // JAS — Jul, Aug, Sep
  Q4: [10, 11, 12],// OND — Oct, Nov, Dec
};

// ─── Date range helper ────────────────────────────────────────────────────────

/**
 * Builds the date range for a period, anchored to a specific month/year.
 *
 * When period = '1M'  → exactly that calendar month.
 * When period = '3M'  → the 3 months ending at the given month.
 * When period = '6M'  → the 6 months ending at the given month.
 * When period = '1Y'  → the 12 months ending at the given month.
 *
 * If month/year are omitted the current month is used as anchor.
 */
function getDateRange(
  period: '1M' | '3M' | '6M' | '1Y',
  anchorMonth?: number,
  anchorYear?: number,
): { from: Date; to: Date } {
  const now = new Date();
  const endMonth  = anchorMonth  ?? (now.getMonth() + 1);
  const endYear   = anchorYear   ?? now.getFullYear();

  // Last moment of anchor month
  const to = new Date(endYear, endMonth, 0, 23, 59, 59, 999); // day 0 = last day of previous month + 1

  const monthsBack = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[period];

  // First moment of the starting month
  const startDate = new Date(endYear, endMonth - 1 - (monthsBack - 1), 1);
  startDate.setHours(0, 0, 0, 0);

  return { from: startDate, to };
}

function getMonthsInRange(period: '1M' | '3M' | '6M' | '1Y'): number {
  return { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[period];
}

@Injectable()
export class TargetsService {
  constructor(private prisma: PrismaService) {}

  // ════════════════════════════════════════════════════════════
  // QUARTERLY INCENTIVES
  // Returns { Q1, Q2, Q3, Q4 } for a given employee and year.
  // Each quarter is the sum of incentiveAmount from deals whose
  // underlying query was created in that quarter's months.
  // ════════════════════════════════════════════════════════════

  async getQuarterlyIncentives(
    companyId: string,
    employeeId: string,
    year: number,
  ): Promise<Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number>> {
    const result: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };

    await Promise.all(
      (Object.entries(QUARTERS) as ['Q1' | 'Q2' | 'Q3' | 'Q4', number[]][]).map(
        async ([qKey, months]) => {
          const from = new Date(year, months[0] - 1, 1);
          from.setHours(0, 0, 0, 0);
          const to = new Date(year, months[months.length - 1], 0, 23, 59, 59, 999);

          const agg = await this.prisma.deal.aggregate({
            where: {
              companyId,
              query: {
                createdById: employeeId,
                createdAt: { gte: from, lte: to },
              },
              incentiveAmount: { not: null },
            },
            _sum: { incentiveAmount: true },
          });

          result[qKey] = Number(agg._sum.incentiveAmount ?? 0);
        },
      ),
    );

    return result;
  }

  // ════════════════════════════════════════════════════════════
  // SUMMARY — aggregates calls/deals/visits/meetings/incentive
  // for a given period, anchored at a specific month/year.
  // Also returns quarterly incentive breakdown for that year.
  // ════════════════════════════════════════════════════════════

  async getSummary(
    companyId: string,
    requestingUser: { employeeId: string; designation: Designation; subordinateIds: string[] },
    targetEmployeeId: string,
    period: '1M' | '3M' | '6M' | '1Y',
    anchorMonth?: number,
    anchorYear?: number,
  ) {
    // Security: non-admins can only see themselves or their subordinates
    if (requestingUser.designation !== Designation.ADMIN) {
      const allowed = [requestingUser.employeeId, ...(requestingUser.subordinateIds ?? [])];
      if (!allowed.includes(targetEmployeeId)) {
        throw new ForbiddenException("You can only view your own or your subordinates' targets");
      }
    }

    const { from, to } = getDateRange(period, anchorMonth, anchorYear);
    const months       = getMonthsInRange(period);
    const resolvedYear = anchorYear ?? new Date().getFullYear();

    // ── 1. Call count = queries + remarks ────────────────────────────────────
    const [queryCount, remarkCount] = await Promise.all([
      this.prisma.leadQuery.count({
        where: { createdById: targetEmployeeId, lead: { companyId }, createdAt: { gte: from, lte: to } },
      }),
      this.prisma.queryRemark.count({
        where: { createdById: targetEmployeeId, query: { lead: { companyId } }, createdAt: { gte: from, lte: to } },
      }),
    ]);
    const totalCalls = queryCount + remarkCount;

    // ── 2. Visits, Meetings, Deals ───────────────────────────────────────────
    const [visits, meetings, deals] = await Promise.all([
      this.prisma.leadQuery.count({
        where: { createdById: targetEmployeeId, lead: { companyId }, status: 'VISIT_DONE',   createdAt: { gte: from, lte: to } },
      }),
      this.prisma.leadQuery.count({
        where: { createdById: targetEmployeeId, lead: { companyId }, status: 'MEETING_DONE', createdAt: { gte: from, lte: to } },
      }),
      this.prisma.leadQuery.count({
        where: { createdById: targetEmployeeId, lead: { companyId }, status: 'DEAL_DONE',    createdAt: { gte: from, lte: to } },
      }),
    ]);

    // ── 3. Sales revenue + incentive ─────────────────────────────────────────
    const [revenueResult, incentiveResult] = await Promise.all([
      this.prisma.deal.aggregate({
        where: {
          companyId,
          query: { createdById: targetEmployeeId, createdAt: { gte: from, lte: to } },
          salesRevenue: { not: null },
        },
        _sum: { salesRevenue: true },
      }),
      this.prisma.deal.aggregate({
        where: {
          companyId,
          query: { createdById: targetEmployeeId, createdAt: { gte: from, lte: to } },
          incentiveAmount: { not: null },
        },
        _sum: { incentiveAmount: true },
      }),
    ]);
    const salesAchieved = Number(revenueResult._sum.salesRevenue  ?? 0);
    const totalIncentive = Number(incentiveResult._sum.incentiveAmount ?? 0);

    // ── 4. Targets — sum over months in range ────────────────────────────────
    const anchorDate = anchorMonth && anchorYear
      ? new Date(anchorYear, anchorMonth - 1, 1)
      : new Date();

    const monthsArr: { month: number; year: number }[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
      monthsArr.push({ month: d.getMonth() + 1, year: d.getFullYear() });
    }

    const targetRows = await this.prisma.target.findMany({
      where: {
        companyId,
        employeeId: targetEmployeeId,
        OR: monthsArr.map((m) => ({ month: m.month, year: m.year })),
      },
    });

    const callTarget  = targetRows.reduce((s, t) => s + (t.callTarget  ?? 0), 0);
    const salesTarget = targetRows.reduce((s, t) => s + Number(t.salesTarget ?? 0), 0);

    // ── 5. Quarterly incentives for the year ─────────────────────────────────
    const quarterlyIncentives = await this.getQuarterlyIncentives(
      companyId, targetEmployeeId, resolvedYear,
    );

    // ── 6. Employee info ──────────────────────────────────────────────────────
    const employee = await this.prisma.employee.findFirst({
      where: { id: targetEmployeeId, companyId },
      select: { id: true, firstName: true, lastName: true, designation: true, dailyCallTarget: true },
    });

    return {
      period,
      employee,
      achieved: {
        calls: totalCalls, queries: queryCount, remarks: remarkCount,
        visits, meetings, deals,
        salesRevenue: salesAchieved,
        incentive:    totalIncentive,
      },
      targets: { calls: callTarget, salesRevenue: salesTarget },
      dateRange: { from, to },
      quarterlyIncentives,
    };
  }

  // ════════════════════════════════════════════════════════════
  // TODAY'S STATS
  // ════════════════════════════════════════════════════════════

  async getTodayStats(companyId: string, targetEmployeeId: string) {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to   = new Date(); to.setHours(23, 59, 59, 999);

    const [queries, remarks, visits, meetings, deals] = await Promise.all([
      this.prisma.leadQuery.count({ where: { createdById: targetEmployeeId, lead: { companyId }, createdAt: { gte: from, lte: to } } }),
      this.prisma.queryRemark.count({ where: { createdById: targetEmployeeId, query: { lead: { companyId } }, createdAt: { gte: from, lte: to } } }),
      this.prisma.leadQuery.count({ where: { createdById: targetEmployeeId, lead: { companyId }, status: 'VISIT_DONE',   createdAt: { gte: from, lte: to } } }),
      this.prisma.leadQuery.count({ where: { createdById: targetEmployeeId, lead: { companyId }, status: 'MEETING_DONE', createdAt: { gte: from, lte: to } } }),
      this.prisma.leadQuery.count({ where: { createdById: targetEmployeeId, lead: { companyId }, status: 'DEAL_DONE',    createdAt: { gte: from, lte: to } } }),
    ]);

    const employee = await this.prisma.employee.findFirst({
      where: { id: targetEmployeeId, companyId },
      select: { dailyCallTarget: true },
    });

    return { calls: queries + remarks, visits, meetings, deals, dailyCallTarget: employee?.dailyCallTarget ?? 0 };
  }

  // ════════════════════════════════════════════════════════════
  // MONTHLY SERIES — last N months for graphs
  // ════════════════════════════════════════════════════════════

  async getMyTargetSeries(companyId: string, employeeId: string, months: number) {
    const count = Math.max(1, Math.min(Number(months || 6), 24));
    const now   = new Date();

    const wanted: Array<{ month: number; year: number }> = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      wanted.push({ month: d.getMonth() + 1, year: d.getFullYear() });
    }

    const [targets, employeeRecord] = await Promise.all([
      this.prisma.target.findMany({
        where: {
          companyId, employeeId,
          OR: wanted.map((w) => ({ month: w.month, year: w.year })),
        },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
      }),
      this.prisma.employee.findFirst({
        where: { id: employeeId, companyId },
        select: { dailyCallTarget: true, monthlySalesTarget: true },
      }),
    ]);

    const defaultCallTarget  = employeeRecord?.dailyCallTarget  ?? 0;
    const defaultSalesTarget = Number(employeeRecord?.monthlySalesTarget ?? 0);

    const seriesWithActuals = await Promise.all(
      wanted.map(async (w) => {
        const monthStart = new Date(w.year, w.month - 1, 1);
        const monthEnd   = new Date(w.year, w.month, 0, 23, 59, 59, 999);

        const [qCount, rCount, visits, meetings, deals, revenue] = await Promise.all([
          this.prisma.leadQuery.count({ where: { createdById: employeeId, lead: { companyId }, createdAt: { gte: monthStart, lte: monthEnd } } }),
          this.prisma.queryRemark.count({ where: { createdById: employeeId, query: { lead: { companyId } }, createdAt: { gte: monthStart, lte: monthEnd } } }),
          this.prisma.leadQuery.count({ where: { createdById: employeeId, lead: { companyId }, status: 'VISIT_DONE',   createdAt: { gte: monthStart, lte: monthEnd } } }),
          this.prisma.leadQuery.count({ where: { createdById: employeeId, lead: { companyId }, status: 'MEETING_DONE', createdAt: { gte: monthStart, lte: monthEnd } } }),
          this.prisma.leadQuery.count({ where: { createdById: employeeId, lead: { companyId }, status: 'DEAL_DONE',    createdAt: { gte: monthStart, lte: monthEnd } } }),
          this.prisma.deal.aggregate({
            where: { companyId, query: { createdById: employeeId, createdAt: { gte: monthStart, lte: monthEnd } }, salesRevenue: { not: null } },
            _sum: { salesRevenue: true },
          }),
        ]);

        const t = targets.find((x) => x.month === w.month && x.year === w.year);
        return {
          month: w.month, year: w.year,
          callTarget:       (t?.callTarget && t.callTarget > 0)             ? t.callTarget             : defaultCallTarget,
          salesTarget:      (t?.salesTarget && Number(t.salesTarget) > 0)   ? Number(t.salesTarget)   : defaultSalesTarget,
          callsAchieved:    qCount + rCount,
          salesAchieved:    Number(revenue._sum.salesRevenue ?? 0),
          visitsAchieved:   visits,
          meetingsAchieved: meetings,
          dealsAchieved:    deals,
        };
      }),
    );

    return seriesWithActuals;
  }

  // ════════════════════════════════════════════════════════════
  // SET TARGET (Admin only)
  // ════════════════════════════════════════════════════════════

  async setTarget(companyId: string, dto: SetTargetDto, designation: Designation) {
    if (designation !== Designation.ADMIN) throw new ForbiddenException('Only admin can set targets');
    if (dto.month < 1 || dto.month > 12) throw new BadRequestException('Month must be between 1 and 12');

    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId, isActive: true } });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.target.upsert({
      where:  { employeeId_month_year: { employeeId: dto.employeeId, month: dto.month, year: dto.year } },
      update: {
        ...(dto.callTarget  !== undefined && { callTarget:  dto.callTarget  }),
        ...(dto.salesTarget !== undefined && { salesTarget: dto.salesTarget }),
      },
      create: {
        companyId, employeeId: dto.employeeId,
        month: dto.month, year: dto.year,
        callTarget: dto.callTarget ?? 0, salesTarget: dto.salesTarget ?? 0,
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true, designation: true } } },
    });
  }

  // ════════════════════════════════════════════════════════════
  // GET MY TARGET (single month)
  // ════════════════════════════════════════════════════════════

  async getMyTarget(companyId: string, employeeId: string, month?: number, year?: number) {
    const now = new Date();
    const m = month ? Number(month) : now.getMonth() + 1;
    const y = year  ? Number(year)  : now.getFullYear();

    const monthStart = new Date(y, m - 1, 1);
    const monthEnd   = new Date(y, m, 0, 23, 59, 59, 999);

    const [target, employeeRecord, qCount, rCount, visits, meetings, deals, revenue, incentive] = await Promise.all([
      this.prisma.target.findUnique({
        where: { employeeId_month_year: { employeeId, month: m, year: y } },
        include: { employee: { select: { firstName: true, lastName: true, designation: true } } },
      }),
      this.prisma.employee.findFirst({
        where: { id: employeeId, companyId },
        select: { firstName: true, lastName: true, designation: true, dailyCallTarget: true, monthlySalesTarget: true },
      }),
      this.prisma.leadQuery.count({ where: { createdById: employeeId, lead: { companyId }, createdAt: { gte: monthStart, lte: monthEnd } } }),
      this.prisma.queryRemark.count({ where: { createdById: employeeId, query: { lead: { companyId } }, createdAt: { gte: monthStart, lte: monthEnd } } }),
      this.prisma.leadQuery.count({ where: { createdById: employeeId, lead: { companyId }, status: 'VISIT_DONE',   createdAt: { gte: monthStart, lte: monthEnd } } }),
      this.prisma.leadQuery.count({ where: { createdById: employeeId, lead: { companyId }, status: 'MEETING_DONE', createdAt: { gte: monthStart, lte: monthEnd } } }),
      this.prisma.leadQuery.count({ where: { createdById: employeeId, lead: { companyId }, status: 'DEAL_DONE',    createdAt: { gte: monthStart, lte: monthEnd } } }),
      this.prisma.deal.aggregate({
        where: { companyId, query: { createdById: employeeId, createdAt: { gte: monthStart, lte: monthEnd } }, salesRevenue: { not: null } },
        _sum: { salesRevenue: true },
      }),
      this.prisma.deal.aggregate({
        where: { companyId, query: { createdById: employeeId, createdAt: { gte: monthStart, lte: monthEnd } }, incentiveAmount: { not: null } },
        _sum: { incentiveAmount: true },
      }),
    ]);

    const resolvedCallTarget  = (target?.callTarget && target.callTarget > 0) ? target.callTarget : (employeeRecord?.dailyCallTarget ?? 0);
    const resolvedSalesTarget = (target?.salesTarget && Number(target.salesTarget) > 0) ? Number(target.salesTarget) : Number(employeeRecord?.monthlySalesTarget ?? 0);

    return {
      employeeId, month: m, year: y,
      callTarget: resolvedCallTarget, salesTarget: resolvedSalesTarget,
      callsAchieved:   qCount + rCount,
      salesAchieved:   Number(revenue._sum.salesRevenue   ?? 0),
      incentiveEarned: Number(incentive._sum.incentiveAmount ?? 0),
      visitsAchieved:   visits, meetingsAchieved: meetings, dealsAchieved: deals,
      employee: target?.employee ?? employeeRecord,
    };
  }

  // ════════════════════════════════════════════════════════════
  // GET TEAM TARGETS
  // Now also fetches quarterly incentives per employee.
  // ════════════════════════════════════════════════════════════

  async getTeamTargets(
    companyId: string,
    employeeId: string,
    designation: Designation,
    subordinateIds: string[],
    dto: GetTargetsDto,
  ) {
    const now    = new Date();
    const month  = dto.month ? Number(dto.month) : now.getMonth() + 1;
    const year   = dto.year  ? Number(dto.year)  : now.getFullYear();
    const isAdmin  = designation === Designation.ADMIN;
    const scopeIds = isAdmin ? null : [employeeId, ...subordinateIds];

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd   = new Date(year, month, 0, 23, 59, 59, 999);

    const employees = await this.prisma.employee.findMany({
      where: {
        companyId, isActive: true,
        ...(scopeIds ? { id: { in: scopeIds } } : {}),
        ...(dto.employeeId && isAdmin ? { id: dto.employeeId } : {}),
      },
      select: {
        id: true, firstName: true, lastName: true,
        designation: true, avatar: true,
        dailyCallTarget: true, monthlySalesTarget: true,
      },
    });

    const results = await Promise.all(
      employees.map(async (emp) => {
        const [target, qCount, rCount, visits, meetings, deals, revenue, incentive, quarterlyIncentives] =
          await Promise.all([
            this.prisma.target.findUnique({
              where: { employeeId_month_year: { employeeId: emp.id, month, year } },
            }),
            this.prisma.leadQuery.count({ where: { createdById: emp.id, lead: { companyId }, createdAt: { gte: monthStart, lte: monthEnd } } }),
            this.prisma.queryRemark.count({ where: { createdById: emp.id, query: { lead: { companyId } }, createdAt: { gte: monthStart, lte: monthEnd } } }),
            this.prisma.leadQuery.count({ where: { createdById: emp.id, lead: { companyId }, status: 'VISIT_DONE',   createdAt: { gte: monthStart, lte: monthEnd } } }),
            this.prisma.leadQuery.count({ where: { createdById: emp.id, lead: { companyId }, status: 'MEETING_DONE', createdAt: { gte: monthStart, lte: monthEnd } } }),
            this.prisma.leadQuery.count({ where: { createdById: emp.id, lead: { companyId }, status: 'DEAL_DONE',    createdAt: { gte: monthStart, lte: monthEnd } } }),
            this.prisma.deal.aggregate({
              where: { companyId, query: { createdById: emp.id, createdAt: { gte: monthStart, lte: monthEnd } }, salesRevenue: { not: null } },
              _sum: { salesRevenue: true },
            }),
            this.prisma.deal.aggregate({
              where: { companyId, query: { createdById: emp.id, createdAt: { gte: monthStart, lte: monthEnd } }, incentiveAmount: { not: null } },
              _sum: { incentiveAmount: true },
            }),
            // ── Quarterly incentives for the selected year ──────────────────
            this.getQuarterlyIncentives(companyId, emp.id, year),
          ]);

        const resolvedCallTarget  = (target?.callTarget && target.callTarget > 0) ? target.callTarget : (emp.dailyCallTarget ?? 0);
        const resolvedSalesTarget = (target?.salesTarget && Number(target.salesTarget) > 0) ? Number(target.salesTarget) : Number(emp.monthlySalesTarget ?? 0);

        return {
          id:              target?.id ?? `${emp.id}-${month}-${year}`,
          employeeId:      emp.id,
          month, year,
          callTarget:      resolvedCallTarget,
          salesTarget:     resolvedSalesTarget,
          callsAchieved:   qCount + rCount,
          salesAchieved:   Number(revenue._sum.salesRevenue  ?? 0),
          incentiveEarned: Number(incentive._sum.incentiveAmount ?? 0),
          visitsAchieved:   visits,
          meetingsAchieved: meetings,
          dealsAchieved:    deals,
          employee:         emp,
          /** Q1=JFM, Q2=AMJ, Q3=JAS, Q4=OND for the selected year */
          quarterlyIncentives,
        };
      }),
    );

    return results;
  }

  // ════════════════════════════════════════════════════════════
  // INCREMENT ACHIEVED (called by LeadsService)
  // ════════════════════════════════════════════════════════════

  async incrementAchieved(
    employeeId: string,
    companyId: string,
    field: 'callsAchieved' | 'dealsAchieved' | 'visitsAchieved' | 'meetingsAchieved',
  ) {
    if (field === 'callsAchieved') return; // computed live

    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    await this.prisma.target.upsert({
      where:  { employeeId_month_year: { employeeId, month, year } },
      update: { [field]: { increment: 1 } },
      create: { companyId, employeeId, month, year, [field]: 1 },
    });
  }

  async adjustSalesAchieved(employeeId: string, companyId: string, month: number, year: number, diff: number) {
    await this.prisma.target.upsert({
      where:  { employeeId_month_year: { employeeId, month, year } },
      update: { salesAchieved: { increment: diff } },
      create: { companyId, employeeId, month, year, salesAchieved: Math.max(0, diff) },
    });
  }
}