import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Designation, LeadStatus } from '@prisma/client';
import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';

export class ReportFilterDto {
  @IsOptional() @IsString()
  startDate?: string;

  @IsOptional() @IsString()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  month?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  year?: number;

  @IsOptional() @IsString()
  employeeId?: string;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getDateRange(dto: ReportFilterDto): { gte: Date; lte: Date } {
    if (dto.startDate && dto.endDate) {
      return { gte: new Date(dto.startDate), lte: new Date(dto.endDate) };
    }
    const now   = new Date();
    const month = dto.month ? Number(dto.month) : now.getMonth() + 1;
    const year  = dto.year  ? Number(dto.year)  : now.getFullYear();
    return {
      gte: new Date(year, month - 1, 1),
      lte: new Date(year, month, 0, 23, 59, 59, 999),
    };
  }

  private getScopeIds(
    employeeId: string,
    designation: Designation,
    subordinateIds: string[],
  ): string[] | null {
    if (designation === Designation.ADMIN) return null;
    return [employeeId, ...subordinateIds];
  }

  // ── 1. Dashboard Summary ───────────────────────────────────────────────────
  // Uses parallel COUNT queries — fast because all columns are indexed.
  async getDashboardSummary(
    companyId: string,
    employeeId: string,
    designation: Designation,
    subordinateIds: string[],
  ) {
    const scopeIds = this.getScopeIds(employeeId, designation, subordinateIds);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const leadWhere: any = {
      companyId,
      isActive: true,
      ...(scopeIds ? { assignedToId: { in: scopeIds } } : {}),
    };

    const [
      totalLeads, freshLeads, followUpLeads, dealsDoneThisMonth,
      hotProspects, totalCustomers,
    ] = await Promise.all([
      this.prisma.lead.count({ where: leadWhere }),
      this.prisma.lead.count({ where: { ...leadWhere, status: LeadStatus.FRESH } }),
      this.prisma.lead.count({ where: { ...leadWhere, status: LeadStatus.FOLLOW_UP } }),
      this.prisma.lead.count({ where: { ...leadWhere, status: LeadStatus.DEAL_DONE, dealDoneAt: { gte: monthStart, lte: monthEnd } } }),
      this.prisma.lead.count({ where: { ...leadWhere, status: LeadStatus.HOT_PROSPECT } }),
      this.prisma.customer.count({
        where: { companyId, ...(scopeIds ? { assignedToId: { in: scopeIds } } : {}) },
      }),
    ]);

    return { totalLeads, freshLeads, followUpLeads, dealsDoneThisMonth, hotProspects, totalCustomers };
  }

  // ── 2. Full Activity Stats ─────────────────────────────────────────────────
  //
  // OLD approach: findMany() → JS filter/count → O(N) memory + slow for large N
  //
  // NEW approach:
  //   • groupBy(status) for counts   → single DB aggregation, no row transfer
  //   • findMany() only for the lead drill-down list, capped at 500 rows
  //   • remarks counted with a single COUNT, not fetched
  //
  async getActivityStats(
    companyId: string,
    requestingEmployeeId: string,
    designation: Designation,
    subordinateIds: string[],
    dto: ReportFilterDto,
  ) {
    const scopeIds  = this.getScopeIds(requestingEmployeeId, designation, subordinateIds);
    const dateRange = this.getDateRange(dto);

    this.logger.debug(
      `getActivityStats | employeeId=${dto.employeeId ?? 'none'} | ` +
      `range=${dateRange.gte.toISOString()} → ${dateRange.lte.toISOString()}`,
    );

    // Which employee(s) to aggregate for
    const employeeFilter = dto.employeeId
      ? { createdById: dto.employeeId }
      : scopeIds
        ? { createdById: { in: scopeIds } }
        : {};

    const queryBase = {
      ...employeeFilter,
      lead: { companyId, isActive: true },
      createdAt: dateRange,
    };

    const remarkBase = {
      ...employeeFilter,
      query: { lead: { companyId, isActive: true } },
      createdAt: dateRange,
    };

    // ── Run all aggregations in parallel ──────────────────────────────────────
    const [
      queryByStatus,   // COUNT per status in one DB round trip
      remarkCount,     // single COUNT for remarks
      hourlyQueries,   // only createdAt — tiny row footprint
      hourlyRemarks,
    ] = await Promise.all([
      // groupBy replaces 11 separate COUNT calls + the big findMany
      this.prisma.leadQuery.groupBy({
        by: ['status'],
        where: queryBase,
        _count: { _all: true },
      }),

      this.prisma.queryRemark.count({ where: remarkBase }),

      // For hourly histogram we only fetch timestamps, not full rows
      this.prisma.leadQuery.findMany({
        where: queryBase,
        select: { createdAt: true },
      }),

      this.prisma.queryRemark.findMany({
        where: remarkBase,
        select: { createdAt: true },
      }),
    ]);

    // Build status → count map from the groupBy result
    const statusMap: Record<string, number> = {};
    let queryTotal = 0;
    for (const row of queryByStatus) {
      statusMap[row.status] = row._count._all;
      queryTotal += row._count._all;
    }

    const totalCalls = queryTotal + remarkCount;

    // Hourly histogram (still done in JS — only timestamps are in memory, not full rows)
    const hourly = Array.from({ length: 12 }, (_, i) => ({
      range: `${String(i * 2).padStart(2, '0')}-${String(i * 2 + 2).padStart(2, '0')}`,
      count: 0,
    }));
    for (const q of hourlyQueries) {
      hourly[Math.min(11, Math.floor(new Date(q.createdAt).getHours() / 2))].count++;
    }
    for (const r of hourlyRemarks) {
      hourly[Math.min(11, Math.floor(new Date(r.createdAt).getHours() / 2))].count++;
    }

    const stats = {
      totalCalls,
      queries:       queryTotal,
      remarks:       remarkCount,
      followups:     statusMap[LeadStatus.FOLLOW_UP]     ?? 0,
      visits:        statusMap[LeadStatus.VISIT_DONE]    ?? 0,
      meetings:      statusMap[LeadStatus.MEETING_DONE]  ?? 0,
      deals:         statusMap[LeadStatus.DEAL_DONE]     ?? 0,
      notInterested: statusMap[LeadStatus.NOT_INTERESTED]?? 0,
      hotProspects:  statusMap[LeadStatus.HOT_PROSPECT]  ?? 0,
      ringing:       statusMap[LeadStatus.RINGING]       ?? 0,
      switchOff:     statusMap[LeadStatus.SWITCH_OFF]    ?? 0,
      callBack:      statusMap[LeadStatus.CALL_BACK]     ?? 0,
      suspect:       statusMap[LeadStatus.SUSPECT]       ?? 0,
    };

    // ── Lead drill-down lists — fetched lazily per status, capped at 500 ─────
    // Only fetch the statuses the frontend actually displays in modals.
    // Each query hits the composite index (createdById, createdAt, status).
    const DRILL_STATUSES: LeadStatus[] = [
      LeadStatus.FOLLOW_UP, LeadStatus.VISIT_DONE, LeadStatus.MEETING_DONE,
      LeadStatus.DEAL_DONE, LeadStatus.NOT_INTERESTED, LeadStatus.HOT_PROSPECT,
      LeadStatus.RINGING, LeadStatus.SWITCH_OFF, LeadStatus.CALL_BACK, LeadStatus.SUSPECT,
    ];

    const drillResults = await Promise.all(
      DRILL_STATUSES.map(status =>
        this.prisma.leadQuery.findMany({
          where: { ...queryBase, status },
          select: {
            id: true, status: true, createdAt: true,
            lead: { select: { id: true, name: true, phone: true, source: true, status: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 500, // cap: beyond 500 rows the modal is unusable anyway
        })
      )
    );

    // "calls" drill-down = union of all statuses, deduplicated by lead, capped at 500
    const allQueriesForDrill = await this.prisma.leadQuery.findMany({
      where: queryBase,
      select: {
        id: true, status: true, createdAt: true,
        lead: { select: { id: true, name: true, phone: true, source: true, status: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const leads: Record<string, any[]> = {
      calls: this.dedupeLeads(allQueriesForDrill),
    };
    DRILL_STATUSES.forEach((status, i) => {
      const key = this.statusToLeadsKey(status);
      leads[key] = this.dedupeLeads(drillResults[i]);
    });

    return { stats, hourly, leads, dateRange };
  }

  private statusToLeadsKey(status: LeadStatus): string {
    const map: Partial<Record<LeadStatus, string>> = {
      [LeadStatus.FOLLOW_UP]:     'followups',
      [LeadStatus.VISIT_DONE]:    'visits',
      [LeadStatus.MEETING_DONE]:  'meetings',
      [LeadStatus.DEAL_DONE]:     'deals',
      [LeadStatus.NOT_INTERESTED]:'notInterested',
      [LeadStatus.HOT_PROSPECT]:  'hotProspects',
      [LeadStatus.RINGING]:       'ringing',
      [LeadStatus.SWITCH_OFF]:    'switchOff',
      [LeadStatus.CALL_BACK]:     'callBack',
      [LeadStatus.SUSPECT]:       'suspect',
    };
    return map[status] ?? status.toLowerCase();
  }

  private dedupeLeads(queries: any[]): any[] {
    const seen = new Set<string>();
    return queries.filter(q => {
      if (seen.has(q.lead.id)) return false;
      seen.add(q.lead.id);
      return true;
    }).map(q => ({
      leadId:    q.lead.id,
      name:      q.lead.name,
      phone:     q.lead.phone,
      source:    q.lead.source,
      status:    q.status,
      createdAt: q.createdAt,
      createdBy: q.createdBy,
    }));
  }

  // ── 3. Team Performance ────────────────────────────────────────────────────
  //
  // OLD approach: N employees × 7 COUNT queries = 7N sequential DB round trips
  //
  // NEW approach: two groupBy queries (queries + remarks) → join in JS.
  // For 20 employees this goes from ~140 DB round trips to 3.
  //
  async getTeamPerformanceReport(
    companyId: string,
    employeeId: string,
    designation: Designation,
    subordinateIds: string[],
    dto: ReportFilterDto,
  ) {
    const scopeIds  = this.getScopeIds(employeeId, designation, subordinateIds);
    const dateRange = this.getDateRange(dto);

    // Fetch employee list
    const employees = await this.prisma.employee.findMany({
      where: {
        companyId,
        isActive: true,
        ...(scopeIds ? { id: { in: scopeIds } } : {}),
        ...(dto.employeeId ? { id: dto.employeeId } : {}),
      },
      select: { id: true, firstName: true, lastName: true, designation: true, dailyCallTarget: true },
    });

    if (employees.length === 0) return { data: [], dateRange };

    const empIds = employees.map(e => e.id);

    // Single groupBy per table — DB does all the counting
    const [queryGroups, remarkGroups] = await Promise.all([
      this.prisma.leadQuery.groupBy({
        by: ['createdById', 'status'],
        where: {
          createdById: { in: empIds },
          lead: { companyId, isActive: true },
          createdAt: dateRange,
        },
        _count: { _all: true },
      }),
      this.prisma.queryRemark.groupBy({
        by: ['createdById'],
        where: {
          createdById: { in: empIds },
          query: { lead: { companyId, isActive: true } },
          createdAt: dateRange,
        },
        _count: { _all: true },
      }),
    ]);

    // Build lookup maps
    // queryMap[empId][status] = count
    const queryMap: Record<string, Record<string, number>> = {};
    for (const row of queryGroups) {
      if (!queryMap[row.createdById]) queryMap[row.createdById] = {};
      queryMap[row.createdById][row.status] = row._count._all;
    }

    const remarkMap: Record<string, number> = {};
    for (const row of remarkGroups) {
      remarkMap[row.createdById] = row._count._all;
    }

    const data = employees.map(emp => {
      const qByStatus = queryMap[emp.id] ?? {};
      const queries   = Object.values(qByStatus).reduce((a, b) => a + b, 0);
      const remarks   = remarkMap[emp.id] ?? 0;
      return {
        ...emp,
        callsMade:       queries + remarks,
        queries,
        remarks,
        visitsCompleted: qByStatus[LeadStatus.VISIT_DONE]    ?? 0,
        meetingsHeld:    qByStatus[LeadStatus.MEETING_DONE]  ?? 0,
        dealsDone:       qByStatus[LeadStatus.DEAL_DONE]     ?? 0,
        notInterested:   qByStatus[LeadStatus.NOT_INTERESTED]?? 0,
        followUps:       qByStatus[LeadStatus.FOLLOW_UP]     ?? 0,
      };
    });

    return { data, dateRange };
  }

  // ── 4. Lead Status Breakdown ───────────────────────────────────────────────
  async getLeadStatusReport(
    companyId: string, employeeId: string, designation: Designation,
    subordinateIds: string[], dto: ReportFilterDto,
  ) {
    const scopeIds  = this.getScopeIds(employeeId, designation, subordinateIds);
    const dateRange = this.getDateRange(dto);
    const where: any = {
      companyId, isActive: true, createdAt: dateRange,
      ...(scopeIds ? { assignedToId: { in: scopeIds } } : {}),
    };
    const grouped = await this.prisma.lead.groupBy({ by: ['status'], where, _count: true });
    const statusMap = Object.fromEntries(Object.values(LeadStatus).map(s => [s, 0]));
    for (const g of grouped) statusMap[g.status] = g._count;
    return { statusBreakdown: statusMap, total: Object.values(statusMap).reduce((a, b) => a + b, 0), dateRange };
  }

  // ── 5. Lead Source Breakdown ───────────────────────────────────────────────
  async getLeadSourceReport(
    companyId: string, employeeId: string, designation: Designation,
    subordinateIds: string[], dto: ReportFilterDto,
  ) {
    const scopeIds  = this.getScopeIds(employeeId, designation, subordinateIds);
    const dateRange = this.getDateRange(dto);
    const grouped = await this.prisma.lead.groupBy({
      by: ['source'], _count: true,
      where: { companyId, isActive: true, createdAt: dateRange, ...(scopeIds ? { assignedToId: { in: scopeIds } } : {}) },
      orderBy: { _count: { source: 'desc' } },
    });
    return { sourceBreakdown: grouped, dateRange };
  }

  // ── 6. Deals Report ────────────────────────────────────────────────────────
  async getDealsReport(
    companyId: string, employeeId: string, designation: Designation,
    subordinateIds: string[], dto: ReportFilterDto,
  ) {
    const scopeIds  = this.getScopeIds(employeeId, designation, subordinateIds);
    const dateRange = this.getDateRange(dto);
    const deals = await this.prisma.lead.findMany({
      where: {
        companyId, isActive: true, status: LeadStatus.DEAL_DONE, dealDoneAt: dateRange,
        ...(scopeIds ? { assignedToId: { in: scopeIds } } : {}),
      },
      select: {
        id: true, name: true, phone: true, dealDoneAt: true, source: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        queries: {
          where: { status: 'DEAL_DONE' },
          orderBy: { createdAt: 'desc' }, take: 1,
          select: { closingAmount: true, incentiveSlab: true, unitNo: true },
        },
      },
      orderBy: { dealDoneAt: 'desc' },
    });
    const totalRevenue = deals.reduce((s, d) => s + Number(d.queries[0]?.closingAmount ?? 0), 0);
    return { data: deals, totalDeals: deals.length, totalRevenue, dateRange };
  }

  // ── 7. Call Activity Histogram ─────────────────────────────────────────────
  async getCallActivityReport(
    companyId: string, employeeId: string, designation: Designation,
    subordinateIds: string[], dto: ReportFilterDto,
  ) {
    const scopeIds  = this.getScopeIds(employeeId, designation, subordinateIds);
    const dateRange = this.getDateRange(dto);
    const targetId  = dto.employeeId || (scopeIds ? undefined : employeeId);

    const queries = await this.prisma.leadQuery.findMany({
      where: {
        lead: { companyId, isActive: true },
        createdAt: dateRange,
        ...(targetId ? { createdById: targetId } : scopeIds ? { createdById: { in: scopeIds } } : {}),
      },
      select: { createdAt: true }, // only pull the timestamp column
    });

    const hourly = Array.from({ length: 12 }, (_, i) => ({
      range: `${String(i * 2).padStart(2, '0')}-${String(i * 2 + 2).padStart(2, '0')}`,
      count: 0,
    }));
    for (const q of queries) {
      hourly[Math.min(11, Math.floor(new Date(q.createdAt).getHours() / 2))].count++;
    }
    return { buckets: hourly, total: queries.length, dateRange };
  }

  // ── 7b. Daily Call Activity (KRA Calendar) ─────────────────────────────────
  //
  // OLD approach: findMany all rows → JS groupBy day
  // NEW approach: raw SQL date_trunc groupBy → DB does the grouping
  //
  async getDailyCallActivityReport(
    companyId: string, employeeId: string, designation: Designation,
    subordinateIds: string[], dto: ReportFilterDto,
  ) {
    const scopeIds  = this.getScopeIds(employeeId, designation, subordinateIds);
    const dateRange = this.getDateRange(dto);
    const targetId  = dto.employeeId ?? employeeId;

    const m = dto.month ? Number(dto.month) : dateRange.gte.getMonth() + 1;
    const y = dto.year  ? Number(dto.year)  : dateRange.gte.getFullYear();

    // Fetch call target + monthly target override in parallel
    const [targetEmployee, monthlyTarget] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: targetId, companyId },
        select: { dailyCallTarget: true },
      }),
      this.prisma.target.findUnique({
        where: { employeeId_month_year: { employeeId: targetId, month: m, year: y } },
        select: { callTarget: true },
      }),
    ]);

    const dailyCallTarget = targetEmployee?.dailyCallTarget ?? 0;
    const effectiveCallTarget =
      monthlyTarget?.callTarget && monthlyTarget.callTarget > 0
        ? monthlyTarget.callTarget
        : dailyCallTarget;

    // ── Raw SQL groupBy day — single round trip instead of full scan ──────────
    // date_trunc('day', ...) groups timestamps into calendar days.
    // This lets Postgres do the work; we only receive one row per active day.
    const [queryBuckets, remarkBuckets] = await Promise.all([
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', lq."createdAt") AS day, COUNT(*)::int AS count
        FROM lead_queries lq
        JOIN leads l ON l.id = lq."leadId"
        WHERE lq."createdById"      = ${targetId}
          AND l."companyId"         = ${companyId}
          AND l."isActive"          = true
          AND lq."createdAt"       >= ${dateRange.gte}
          AND lq."createdAt"       <= ${dateRange.lte}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', qr."createdAt") AS day, COUNT(*)::int AS count
        FROM query_remarks qr
        JOIN lead_queries lq ON lq.id = qr."queryId"
        JOIN leads l ON l.id = lq."leadId"
        WHERE qr."createdById"      = ${targetId}
          AND l."companyId"         = ${companyId}
          AND l."isActive"          = true
          AND qr."createdAt"       >= ${dateRange.gte}
          AND qr."createdAt"       <= ${dateRange.lte}
        GROUP BY 1
      `,
    ]);

    // Merge query + remark counts per day
    const dayMap: Record<string, number> = {};
    for (const row of queryBuckets) {
      const key = row.day.toISOString().slice(0, 10);
      dayMap[key] = (dayMap[key] ?? 0) + Number(row.count);
    }
    for (const row of remarkBuckets) {
      const key = row.day.toISOString().slice(0, 10);
      dayMap[key] = (dayMap[key] ?? 0) + Number(row.count);
    }

    const daysInMonth = new Date(y, m, 0).getDate();
    const buckets = Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return { date: dateStr, callsMade: dayMap[dateStr] ?? 0, callTarget: effectiveCallTarget };
    });

    const total = Object.values(dayMap).reduce((a, b) => a + b, 0);
    return { buckets, total, dailyCallTarget: effectiveCallTarget };
  }

  // ── 8. Attendance Report ───────────────────────────────────────────────────
  async getAttendanceReport(
    companyId: string, employeeId: string, designation: Designation,
    subordinateIds: string[], dto: ReportFilterDto,
  ) {
    const scopeIds  = this.getScopeIds(employeeId, designation, subordinateIds);
    const dateRange = this.getDateRange(dto);
    const records   = await this.prisma.attendance.findMany({
      where: { companyId, date: dateRange, ...(scopeIds ? { employeeId: { in: scopeIds } } : {}) },
      include: { employee: { select: { id: true, firstName: true, lastName: true, designation: true } } },
      orderBy: { date: 'desc' },
    });
    const byEmployee: Record<string, any> = {};
    for (const r of records) {
      const eid = r.employeeId;
      if (!byEmployee[eid]) byEmployee[eid] = { employee: r.employee, fullDays: 0, halfDays: 0, absent: 0, totalHours: 0 };
      if (r.status === 'PRESENT_FULL') byEmployee[eid].fullDays++;
      else if (r.status === 'PRESENT_HALF') byEmployee[eid].halfDays++;
      else byEmployee[eid].absent++;
      byEmployee[eid].totalHours += Number(r.hoursWorked ?? 0);
    }
    return { summary: Object.values(byEmployee), dateRange };
  }

  // ── 9. Expense Report ──────────────────────────────────────────────────────
  async getExpenseReport(
    companyId: string, employeeId: string, designation: Designation,
    subordinateIds: string[], dto: ReportFilterDto,
  ) {
    const scopeIds  = this.getScopeIds(employeeId, designation, subordinateIds);
    const dateRange = this.getDateRange(dto);
    const where: any = { companyId, expenseDate: dateRange, ...(scopeIds ? { createdById: { in: scopeIds } } : {}) };
    const [records, byCategory, total] = await Promise.all([
      this.prisma.expense.findMany({ where, include: { createdBy: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { expenseDate: 'desc' } }),
      this.prisma.expense.groupBy({ by: ['category'], where, _sum: { amount: true }, _count: true }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    return { data: records, byCategory, totalAmount: total._sum.amount ?? 0, dateRange };
  }
}