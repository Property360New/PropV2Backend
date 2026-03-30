// ============================================================
// src/modules/leads/leads.service.ts
// OPTIMIZED VERSION — target <150ms per tab fetch
//
// Key changes vs original:
//   1. getQueryTab       — replaced nested Prisma include with 2 raw SQL queries
//                          (eliminates 8-15 sequential DB roundtrips → 2)
//   2. getFreshLeads     — replaced nested include with raw SQL JOIN
//   3. getTabCounts      — added 30-second in-memory cache per (company+user+filters)
//   4. getAllLeads        — select-only query, no include
//   5. Connection pool   — PrismaService note added at top
//   6. invalidateTabCountsCache() — called after addQuery, assignLead, bulkAssign, deleteLead
//   7. All original business logic (permissions, targets, notifications) preserved exactly
// ============================================================

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { LeadStatus, Designation, Prisma, NotificationType } from '@prisma/client';
import { getScopeIds } from '../../common/utils/hierarchy.util';
import {
  buildPaginatedResult,
  getPaginationParams,
} from '../../common/utils/pagination.util';
import {
  CreateLeadDto,
  UpdateLeadDto,
  CreateQueryDto,
  UpdateQueryDto,
  CreateRemarkDto,
  LeadFilterDto,
} from './dto/create-lead.dto';
import { FieldDefinitionsService } from '../field-definitions/field-definitions.service';
import { HierarchyService } from '../hierarchy/hierarchy.service';
import { TargetsService } from '../targets/targets.service';
import { NotificationService } from '../notification/notification.service';
import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';
import { startOfDay, endOfDay } from 'date-fns';

// ─── NOTE: Ensure your PrismaService connects at startup ─────────────────────
// In prisma.service.ts:
//   async onModuleInit() { await this.$connect(); }
// In your DATABASE_URL use the PgBouncer port:
//   postgresql://...@db.xxx.supabase.co:6543/postgres?pgbouncer=true&connection_limit=10&pool_timeout=10
// ─────────────────────────────────────────────────────────────────────────────

const AUTO_REMARKS: Partial<Record<LeadStatus, string>> = {
  [LeadStatus.RINGING]: 'Called the client but phone was ringing',
  [LeadStatus.WRONG_NUMBER]: 'Called the client but wrong number',
  [LeadStatus.SWITCH_OFF]: 'Called the client but phone was switched off',
  [LeadStatus.NOT_INTERESTED]: 'Client is not interested',
  [LeadStatus.DEAL_DONE]: 'Deal has been closed successfully',
  [LeadStatus.VISIT_DONE]: 'Site visit completed',
  [LeadStatus.MEETING_DONE]: 'Meeting completed with the client',
  [LeadStatus.CALL_BACK]: 'Client requested a callback',
};

export class QueryTabFilterDto {
  @IsOptional() callStatus?: LeadStatus;
  @IsOptional() @Transform(({ value }) => Number(value)) page?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) limit?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsString() createdById?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
}

// ─── Tab Counts Cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  data: Record<string, number>;
  expiresAt: number;
}

// ─── Search helpers ───────────────────────────────────────────────────────────

function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function escapeStr(s: string): string {
  return s.replace(/'/g, "''");
}

function buildSearchWhere(search: string | undefined): Prisma.LeadWhereInput {
  if (!search?.trim()) return {};

  const term = search.trim();
  const isPhone = /^[0-9+\-\s()]+$/.test(term);
  const digitsOnly = term.replace(/\D/g, '');

  if (isPhone && digitsOnly.length >= 4) {
    const conditions: Prisma.LeadWhereInput[] = [
      { phone: { equals: term } },
      { phone: { startsWith: digitsOnly } },
      { phone: { endsWith: digitsOnly.slice(-4) } },
    ];
    if (digitsOnly.length === 10) {
      conditions.push({ phone: { endsWith: digitsOnly } });
      conditions.push({ phone: { equals: `91${digitsOnly}` } });
    }
    return { OR: conditions };
  }

  return {
    OR: [
      { name: { startsWith: term, mode: 'insensitive' } },
      { email: { startsWith: term, mode: 'insensitive' } },
      { phone: { startsWith: term } },
    ],
  };
}

function buildRawSearchClause(search: string | undefined): string {
  if (!search?.trim()) return '';

  const term = search.trim();
  const isPhone = /^[0-9+\-\s()]+$/.test(term);
  const digitsOnly = term.replace(/\D/g, '');
  const safe = escapeStr(term);
  const safeDigits = escapeStr(digitsOnly);

  if (isPhone && digitsOnly.length >= 4) {
    const last4 = escapeStr(digitsOnly.slice(-4));
    const clauses = [
      `l.phone = '${safe}'`,
      `l.phone LIKE '${escapeStr(escapeLike(digitsOnly))}%'`,
      `l.phone LIKE '%${last4}'`,
    ];
    if (digitsOnly.length === 10) {
      clauses.push(`l.phone LIKE '91${escapeStr(escapeLike(digitsOnly))}%'`);
    }
    return `AND (${clauses.join(' OR ')})`;
  }

  const safeLike = escapeStr(escapeLike(term));
  return `AND (
    l.name ILIKE '${safeLike}%'
    OR l.email ILIKE '${safeLike}%'
    OR l.phone LIKE '${safeLike}%'
  )`;
}

// ─── Raw SQL search fragment for lead_queries table ───────────────────────────

function buildRawSearchClauseForLeads(search: string | undefined, alias = 'l'): string {
  if (!search?.trim()) return '';
  const term = search.trim();
  const isPhone = /^[0-9+\-\s()]+$/.test(term);
  const digitsOnly = term.replace(/\D/g, '');
  const safe = escapeStr(term);

  if (isPhone && digitsOnly.length >= 4) {
    const last4 = escapeStr(digitsOnly.slice(-4));
    const clauses = [
      `${alias}.phone = '${safe}'`,
      `${alias}.phone LIKE '${escapeStr(escapeLike(digitsOnly))}%'`,
      `${alias}.phone LIKE '%${last4}'`,
    ];
    if (digitsOnly.length === 10) {
      clauses.push(`${alias}.phone LIKE '91${escapeStr(escapeLike(digitsOnly))}%'`);
    }
    return `AND (${clauses.join(' OR ')})`;
  }

  const safeLike = escapeStr(escapeLike(term));
  return `AND (
    ${alias}.name ILIKE '${safeLike}%'
    OR ${alias}.email ILIKE '${safeLike}%'
    OR ${alias}.phone LIKE '${safeLike}%'
  )`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  // ── In-memory tab counts cache (30s TTL) ──────────────────────────────────
  private readonly tabCountsCache = new Map<string, CacheEntry>();
  private readonly TAB_COUNTS_TTL_MS = 30_000; // 30 seconds

  constructor(
    private prisma: PrismaService,
    private hierarchyService: HierarchyService,
    private targetsService: TargetsService,
    private fieldDefinitionsService: FieldDefinitionsService,
    private notificationService: NotificationService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // CACHE HELPERS
  // ────────────────────────────────────────────────────────────

  private getTabCountsCacheKey(
    companyId: string,
    employeeId: string,
    search?: string,
    assignedToId?: string,
  ): string {
    return `${companyId}:${employeeId}:${search ?? ''}:${assignedToId ?? ''}`;
  }

  /**
   * Invalidate all cache entries for a given company.
   * Call this after any mutation that changes lead status or assignment.
   */
  private invalidateTabCountsCache(companyId: string): void {
    for (const key of this.tabCountsCache.keys()) {
      if (key.startsWith(`${companyId}:`)) {
        this.tabCountsCache.delete(key);
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // CREATE / UPDATE / DELETE LEADS
  // ════════════════════════════════════════════════════════════

  async createLead(companyId: string, createdById: string, dto: CreateLeadDto) {
    const lead = await this.prisma.lead.create({
      data: {
        companyId,
        createdById,
        name: dto.name,
        phone: dto.phone.replace(/\s/g, ''),
        email: dto.email?.toLowerCase(),
        phone2: dto.phone2,
        address: dto.address,
        source: dto.source,
        type: dto.type,
        assignedToId: dto.assignedToId ?? createdById,
        projectId: dto.projectId,
        status: LeadStatus.FRESH,
        assignedAt: new Date(),
        lastActivityAt: new Date(),
        clientBirthday: dto.clientBirthday ? new Date(dto.clientBirthday) : undefined,
        clientMarriageAnniversary: dto.clientMarriageAnniversary
          ? new Date(dto.clientMarriageAnniversary)
          : undefined,
      },
    });

    if (dto.customFields) {
      await this.fieldDefinitionsService.saveFieldValues(lead.id, dto.customFields, companyId);
    }

    this.invalidateTabCountsCache(companyId);
    return lead;
  }

  async updateLead(companyId: string, leadId: string, dto: UpdateLeadDto) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, companyId } });
    if (!lead) throw new NotFoundException('Lead not found');

    return this.prisma.lead.update({
      where: { id: leadId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.phone && { phone: dto.phone.replace(/\s/g, '') }),
        ...(dto.email !== undefined && { email: dto.email?.toLowerCase() }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.source && { source: dto.source }),
        ...(dto.type && { type: dto.type }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId }),
        ...(dto.clientBirthday !== undefined && {
          clientBirthday: dto.clientBirthday ? new Date(dto.clientBirthday) : null,
        }),
        ...(dto.clientMarriageAnniversary !== undefined && {
          clientMarriageAnniversary: dto.clientMarriageAnniversary
            ? new Date(dto.clientMarriageAnniversary)
            : null,
        }),
      },
    });
  }

  async deleteLead(companyId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, companyId, isActive: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { isActive: false, deletedAt: new Date() },
    });

    this.invalidateTabCountsCache(companyId);
    return { success: true, message: 'Lead deleted' };
  }

  async getAllLeads(
    companyId: string,
    user: {
      employeeId: string;
      designation: Designation;
      subordinateIds: string[];
      permissions: any;
    },
    filter: QueryTabFilterDto & { createdById?: string },
  ) {
    const { page, limit, skip, take } = getPaginationParams(filter);
    const scopeIds = getScopeIds(user);
    const searchWhere = buildSearchWhere(filter.search);

    const where: Prisma.LeadWhereInput = {
      companyId,
      isActive: true,
      ...(scopeIds ? { assignedToId: { in: scopeIds } } : {}),
      ...(filter.assignedToId ? { assignedToId: filter.assignedToId } : {}),
      ...(filter.createdById ? { createdById: filter.createdById } : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            createdAt: {
              ...(filter.dateFrom ? { gte: new Date(filter.dateFrom) } : {}),
              ...(filter.dateTo ? { lte: new Date(filter.dateTo) } : {}),
            },
          }
        : {}),
      ...searchWhere,
    };

    const [total, leads] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          source: true,
          createdAt: true,
          assignedTo: {
            select: { id: true, firstName: true, lastName: true, designation: true },
          },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    return buildPaginatedResult(leads, total, page, limit);
  }

  // ════════════════════════════════════════════════════════════
  // FRESH TAB — OPTIMIZED: single raw SQL JOIN (was nested include)
  // ════════════════════════════════════════════════════════════

  async getFreshLeads(
    companyId: string,
    user: {
      employeeId: string;
      designation: Designation;
      subordinateIds: string[];
      permissions: any;
    },
    filter: QueryTabFilterDto,
  ) {
    const { page, limit, skip, take } = getPaginationParams(filter);
    const scopeIds = getScopeIds(user);

    const safeCompanyId = escapeStr(companyId);
    const scopeClause =
      scopeIds && scopeIds.length > 0
        ? `AND l."assignedToId" = ANY(ARRAY[${scopeIds.map((id) => `'${escapeStr(id)}'`).join(',')}]::text[])`
        : '';
    const assignedClause = filter.assignedToId
      ? `AND l."assignedToId" = '${escapeStr(filter.assignedToId)}'`
      : '';
    const createdByClause = filter.createdById
      ? `AND l."createdById" = '${escapeStr(filter.createdById)}'`
      : '';
    const dateFromClause = filter.dateFrom
      ? `AND l."createdAt" >= '${escapeStr(filter.dateFrom)}'`
      : '';
    const dateToClause = filter.dateTo
      ? `AND l."createdAt" <= '${escapeStr(filter.dateTo)}'`
      : '';
    const searchClause = buildRawSearchClauseForLeads(filter.search, 'l');

    // Single query: leads + join assigned employee + project in one roundtrip
    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT
          l.id,
          l.name,
          l.phone,
          l.email,
          l."phone2",
          l.source,
          l.type,
          l.status,
          l."isHot",
          l."isSuspect",
          l."isFresh",
          l."createdAt",
          l."updatedAt",
          l."assignedAt",
          l."lastActivityAt",
          l."budgetMin",
          l."budgetMax",
          l."budgetUnit",
          l."projectId",
          l."assignedToId",
          l."createdById",
          -- assigned employee (flattened)
          ae.id            AS "ae_id",
          ae."firstName"   AS "ae_firstName",
          ae."lastName"    AS "ae_lastName",
          ae.designation   AS "ae_designation",
          -- project (flattened)
          p.id             AS "p_id",
          p.name           AS "p_name",
          -- created by (flattened)
          cb.id            AS "cb_id",
          cb."firstName"   AS "cb_firstName",
          cb."lastName"    AS "cb_lastName"
        FROM leads l
        LEFT JOIN employees ae ON ae.id = l."assignedToId"
        LEFT JOIN projects   p  ON p.id  = l."projectId"
        LEFT JOIN employees cb  ON cb.id = l."createdById"
        WHERE l."companyId" = '${safeCompanyId}'
          AND l."isActive"  = true
          AND l."isFresh"   = true
          ${scopeClause}
          ${assignedClause}
          ${createdByClause}
          ${dateFromClause}
          ${dateToClause}
          ${searchClause}
        ORDER BY l."assignedAt" DESC NULLS LAST
        LIMIT ${take} OFFSET ${skip}
      `),
      this.prisma.$queryRawUnsafe<[{ count: string }]>(`
        SELECT COUNT(*)::text AS count
        FROM leads l
        WHERE l."companyId" = '${safeCompanyId}'
          AND l."isActive"  = true
          AND l."isFresh"   = true
          ${scopeClause}
          ${assignedClause}
          ${createdByClause}
          ${dateFromClause}
          ${dateToClause}
          ${searchClause}
      `),
    ]);

    const total = parseInt((countRows as any)[0]?.count ?? '0', 10);

    const leads = rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      phone2: r.phone2,
      source: r.source,
      type: r.type,
      status: r.status,
      isHot: r.isHot,
      isSuspect: r.isSuspect,
      isFresh: r.isFresh,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      assignedAt: r.assignedAt,
      lastActivityAt: r.lastActivityAt,
      budgetMin: r.budgetMin,
      budgetMax: r.budgetMax,
      budgetUnit: r.budgetUnit,
      projectId: r.projectId,
      assignedToId: r.assignedToId,
      createdById: r.createdById,
      assignedTo: r.ae_id
        ? { id: r.ae_id, firstName: r.ae_firstName, lastName: r.ae_lastName, designation: r.ae_designation }
        : null,
      project: r.p_id ? { id: r.p_id, name: r.p_name } : null,
      createdBy: r.cb_id ? { id: r.cb_id, firstName: r.cb_firstName, lastName: r.cb_lastName } : null,
    }));

    return buildPaginatedResult(leads, total, page, limit);
  }

  // ════════════════════════════════════════════════════════════
  // QUERY TAB — OPTIMIZED: 2 raw SQL queries (was 8-15 roundtrips)
  // ════════════════════════════════════════════════════════════

  async getQueryTab(
    companyId: string,
    user: {
      employeeId: string;
      designation: Designation;
      subordinateIds: string[];
      permissions: any;
    },
    filter: QueryTabFilterDto & { callStatus: LeadStatus },
  ) {
    const { page, limit, skip, take } = getPaginationParams(filter);
    const scopeIds = getScopeIds(user);

    const safeCompanyId = escapeStr(companyId);
    const safeStatus = escapeStr(filter.callStatus);

    const scopeClause =
      scopeIds && scopeIds.length > 0
        ? `AND l."assignedToId" = ANY(ARRAY[${scopeIds.map((id) => `'${escapeStr(id)}'`).join(',')}]::text[])`
        : '';
    const assignedClause = filter.assignedToId
      ? `AND l."assignedToId" = '${escapeStr(filter.assignedToId)}'`
      : '';
    const searchClause = buildRawSearchClauseForLeads(filter.search, 'l');
    const dateFromClause = filter.dateFrom
      ? `AND lq."createdAt" >= '${escapeStr(filter.dateFrom)}'`
      : '';
    const dateToClause = filter.dateTo
      ? `AND lq."createdAt" <= '${escapeStr(filter.dateTo)}'`
      : '';

    // ── Query 1: paginated leads + their latest matching query in ONE roundtrip ──
    // Uses LATERAL join to grab only the most-recent query per lead for this status.
    // All JOINs happen in Postgres — zero extra roundtrips.
    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT
          -- Lead fields
          l.id              AS "lead_id",
          l.name            AS "lead_name",
          l.phone           AS "lead_phone",
          l.email           AS "lead_email",
          l."phone2"        AS "lead_phone2",
          l.source          AS "lead_source",
          l.type            AS "lead_type",
          l."isHot"         AS "lead_isHot",
          l."lastActivityAt" AS "lead_lastActivityAt",
          l."createdAt"     AS "lead_createdAt",
          l."assignedToId"  AS "lead_assignedToId",
          -- Assigned employee (flattened)
          ae.id             AS "ae_id",
          ae."firstName"    AS "ae_firstName",
          ae."lastName"     AS "ae_lastName",
          ae.designation    AS "ae_designation",
          -- Project (flattened)
          p.id              AS "p_id",
          p.name            AS "p_name",
          -- Latest query fields (via LATERAL)
          lq.id             AS "q_id",
          lq.status         AS "q_status",
          lq.remark         AS "q_remark",
          lq."isAutoRemark" AS "q_isAutoRemark",
          lq."followUpDate" AS "q_followUpDate",
          lq."visitDate"    AS "q_visitDate",
          lq."meetingDate"  AS "q_meetingDate",
          lq."dealDoneDate" AS "q_dealDoneDate",
          lq."expVisitDate" AS "q_expVisitDate",
          lq."shiftingDate" AS "q_shiftingDate",
          lq."budgetMin"    AS "q_budgetMin",
          lq."budgetMax"    AS "q_budgetMax",
          lq."budgetUnit"   AS "q_budgetUnit",
          lq."leadType"     AS "q_leadType",
          lq.bhk            AS "q_bhk",
          lq.size           AS "q_size",
          lq.floor          AS "q_floor",
          lq.location       AS "q_location",
          lq.purpose        AS "q_purpose",
          lq."furnishingType" AS "q_furnishingType",
          lq."closingAmount"  AS "q_closingAmount",
          lq."unitNo"       AS "q_unitNo",
          lq.reason         AS "q_reason",
          lq."createdAt"    AS "q_createdAt",
          lq."projectId"    AS "q_projectId",
          -- Query creator (flattened)
          qcb.id            AS "qcb_id",
          qcb."firstName"   AS "qcb_firstName",
          qcb."lastName"    AS "qcb_lastName",
          qcb.designation   AS "qcb_designation",
          -- Visit done by (flattened)
          vdb.id            AS "vdb_id",
          vdb."firstName"   AS "vdb_firstName",
          vdb."lastName"    AS "vdb_lastName",
          -- Meeting done by (flattened)
          mdb.id            AS "mdb_id",
          mdb."firstName"   AS "mdb_firstName",
          mdb."lastName"    AS "mdb_lastName",
          -- Remark count (scalar subquery — fast with index on queryId)
          (SELECT COUNT(*) FROM query_remarks qr WHERE qr."queryId" = lq.id)::int AS "q_remarkCount"
        FROM leads l
        INNER JOIN LATERAL (
          SELECT *
          FROM lead_queries
          WHERE "leadId" = l.id
            AND status = '${safeStatus}'::"LeadStatus"
            ${dateFromClause}
            ${dateToClause}
          ORDER BY "createdAt" DESC
          LIMIT 1
        ) lq ON true
        LEFT JOIN employees ae  ON ae.id  = l."assignedToId"
        LEFT JOIN projects   p   ON p.id   = l."projectId"
        LEFT JOIN employees qcb ON qcb.id = lq."createdById"
        LEFT JOIN employees vdb ON vdb.id = lq."visitDoneById"
        LEFT JOIN employees mdb ON mdb.id = lq."meetingDoneById"
        WHERE l."companyId" = '${safeCompanyId}'
          AND l."isActive"  = true
          ${scopeClause}
          ${assignedClause}
          ${searchClause}
        ORDER BY l."lastActivityAt" DESC NULLS LAST
        LIMIT ${take} OFFSET ${skip}
      `),

      // ── Query 2: COUNT of distinct leads for this status ──────────────────
      this.prisma.$queryRawUnsafe<[{ count: string }]>(`
        SELECT COUNT(DISTINCT l.id)::text AS count
        FROM leads l
        INNER JOIN lead_queries lq
          ON lq."leadId" = l.id
          AND lq.status = '${safeStatus}'::"LeadStatus"
          ${dateFromClause}
          ${dateToClause}
        WHERE l."companyId" = '${safeCompanyId}'
          AND l."isActive"  = true
          ${scopeClause}
          ${assignedClause}
          ${searchClause}
      `),
    ]);

    const total = parseInt((countRows as any)[0]?.count ?? '0', 10);

    // ── Map flat SQL rows → the shape the frontend expects ───────────────────
    const results = rows.map((r) => ({
      queryId: r.q_id ?? '',
      status: r.q_status ?? filter.callStatus,
      callStatus: r.q_status ?? filter.callStatus,
      remark: r.q_remark ?? null,
      isAutoRemark: r.q_isAutoRemark ?? false,
      followUpDate: r.q_followUpDate ?? null,
      visitDate: r.q_visitDate ?? null,
      meetingDate: r.q_meetingDate ?? null,
      dealDoneDate: r.q_dealDoneDate ?? null,
      expVisitDate: r.q_expVisitDate ?? null,
      shiftingDate: r.q_shiftingDate ?? null,
      budgetMin: r.q_budgetMin ?? null,
      budgetMax: r.q_budgetMax ?? null,
      budgetUnit: r.q_budgetUnit ?? null,
      leadType: r.q_leadType ?? null,
      bhk: r.q_bhk ?? null,
      size: r.q_size ?? null,
      floor: r.q_floor ?? null,
      location: r.q_location ?? null,
      purpose: r.q_purpose ?? null,
      furnishingType: r.q_furnishingType ?? null,
      closingAmount: r.q_closingAmount ?? null,
      unitNo: r.q_unitNo ?? null,
      reason: r.q_reason ?? null,
      visitDoneBy: r.vdb_id
        ? { id: r.vdb_id, firstName: r.vdb_firstName, lastName: r.vdb_lastName }
        : null,
      meetingDoneBy: r.mdb_id
        ? { id: r.mdb_id, firstName: r.mdb_firstName, lastName: r.mdb_lastName }
        : null,
      remarks: [],
      remarkCount: r.q_remarkCount ?? 0,
      createdAt: r.q_createdAt ?? r.lead_lastActivityAt ?? r.lead_createdAt,
      createdBy: r.qcb_id
        ? {
            id: r.qcb_id,
            firstName: r.qcb_firstName,
            lastName: r.qcb_lastName,
            designation: r.qcb_designation,
          }
        : null,
      isHighlighted: true,
      lead: {
        id: r.lead_id,
        name: r.lead_name,
        phone: r.lead_phone,
        email: r.lead_email,
        phone2: r.lead_phone2,
        source: r.lead_source,
        type: r.lead_type,
        createdAt: r.lead_createdAt,
        assignedTo: r.ae_id
          ? {
              id: r.ae_id,
              firstName: r.ae_firstName,
              lastName: r.ae_lastName,
              designation: r.ae_designation,
            }
          : null,
        project: r.p_id ? { id: r.p_id, name: r.p_name } : null,
        isHot: r.lead_isHot,
        lastActivityAt: r.lead_lastActivityAt,
        allQueries: [], // detail panel loads via getLeadById on row click
      },
    }));

    return buildPaginatedResult(results, total, page, limit);
  }

  // ════════════════════════════════════════════════════════════
  // TAB COUNTS — OPTIMIZED: 30-second in-memory cache
  // ════════════════════════════════════════════════════════════

  async getTabCounts(
    companyId: string,
    user: { employeeId: string; designation: Designation; subordinateIds: string[] },
    search?: string,
    assignedToId?: string,
  ) {
    // ── Check cache ───────────────────────────────────────────
    const cacheKey = this.getTabCountsCacheKey(
      companyId,
      user.employeeId,
      search,
      assignedToId,
    );
    const cached = this.tabCountsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // ── Compute ───────────────────────────────────────────────
    const data = await this._computeTabCounts(companyId, user, search, assignedToId);

    // ── Store ─────────────────────────────────────────────────
    this.tabCountsCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + this.TAB_COUNTS_TTL_MS,
    });

    return data;
  }

  private async _computeTabCounts(
    companyId: string,
    user: { employeeId: string; designation: Designation; subordinateIds: string[] },
    search?: string,
    assignedToId?: string,
  ): Promise<Record<string, number>> {
    const scopeIds = getScopeIds(user);
    const safeCompanyId = escapeStr(companyId);

    const scopeClause =
      scopeIds && scopeIds.length > 0
        ? `AND l."assignedToId" = ANY(ARRAY[${scopeIds.map((id) => `'${escapeStr(id)}'`).join(',')}]::text[])`
        : '';
    const assignedClause = assignedToId
      ? `AND l."assignedToId" = '${escapeStr(assignedToId)}'`
      : '';
    const searchClause = buildRawSearchClause(search);

    const rows = await this.prisma.$queryRawUnsafe<
      {
        lead_id: string;
        assigned_to_id: string | null;
        has_own_query: boolean;
        status: string | null;
      }[]
    >(`
      SELECT
        l.id as lead_id,
        l."assignedToId" as assigned_to_id,
        EXISTS(
          SELECT 1 FROM lead_queries q
          WHERE q."leadId" = l.id AND q."createdById" = l."assignedToId"
        ) as has_own_query,
        q.status
      FROM leads l
      LEFT JOIN LATERAL (
        SELECT DISTINCT status FROM lead_queries WHERE "leadId" = l.id
      ) q ON true
      WHERE l."companyId" = '${safeCompanyId}'
        AND l."isActive" = true
        ${scopeClause}
        ${assignedClause}
        ${searchClause}
    `);

    const counts: Record<string, number> = { FRESH: 0 };
    const freshLeads = new Set<string>();
    const statusLeadSets: Record<string, Set<string>> = {};

    for (const row of rows) {
      const isFresh = !row.assigned_to_id || !row.has_own_query;
      if (isFresh && !freshLeads.has(row.lead_id)) {
        freshLeads.add(row.lead_id);
        counts['FRESH']++;
      }
      if (row.status) {
        if (!statusLeadSets[row.status]) statusLeadSets[row.status] = new Set();
        statusLeadSets[row.status].add(row.lead_id);
      }
    }

    for (const [status, set] of Object.entries(statusLeadSets)) {
      counts[status] = set.size;
    }

    return counts;
  }

  // ════════════════════════════════════════════════════════════
  // FIND LEAD TAB
  // ════════════════════════════════════════════════════════════

  async findLeadTab(
    companyId: string,
    user: { employeeId: string; designation: Designation; subordinateIds: string[] },
    search: string,
    assignedToId?: string,
  ): Promise<{ tab: string; leadId: string | null; tabCounts: Record<string, number> }> {
    const scopeIds = getScopeIds(user);
    const searchWhere = buildSearchWhere(search);

    if (!search?.trim()) {
      return { tab: 'FRESH', leadId: null, tabCounts: {} };
    }

    const leadWhere: Prisma.LeadWhereInput = {
      companyId,
      isActive: true,
      ...(scopeIds ? { assignedToId: { in: scopeIds } } : {}),
      ...(assignedToId ? { assignedToId } : {}),
      ...searchWhere,
    };

    const leads = await this.prisma.lead.findMany({
      where: leadWhere,
      select: {
        id: true,
        assignedToId: true,
        lastActivityAt: true,
        queries: {
          select: { status: true, createdById: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastActivityAt: 'desc' },
      take: 20,
    });

    if (leads.length === 0) {
      return { tab: 'FRESH', leadId: null, tabCounts: {} };
    }

    const tabCounts: Record<string, number> = {};
    let bestTab = 'FRESH';
    let bestLeadId: string | null = leads[0]?.id ?? null;

    for (const lead of leads) {
      const isFresh =
        !lead.assignedToId ||
        !lead.queries.some((q) => q.createdById === lead.assignedToId);
      const tab = isFresh ? 'FRESH' : (lead.queries[0]?.status ?? 'FRESH');
      tabCounts[tab] = (tabCounts[tab] ?? 0) + 1;
    }

    let maxCount = 0;
    for (const [tab, count] of Object.entries(tabCounts)) {
      if (count > maxCount) {
        maxCount = count;
        bestTab = tab;
      }
    }

    const bestLead = leads.find((lead) => {
      const isFresh =
        !lead.assignedToId ||
        !lead.queries.some((q) => q.createdById === lead.assignedToId);
      const tab = isFresh ? 'FRESH' : (lead.queries[0]?.status ?? 'FRESH');
      return tab === bestTab;
    });
    bestLeadId = bestLead?.id ?? bestLeadId;

    return { tab: bestTab, leadId: bestLeadId, tabCounts };
  }

  // ════════════════════════════════════════════════════════════
  // GET SINGLE LEAD — unchanged (only called on row click, not on list load)
  // ════════════════════════════════════════════════════════════

  async getLeadById(companyId: string, leadId: string, employeeId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, companyId },
      include: {
        queries: {
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: { select: { id: true, firstName: true, lastName: true } },
            project: { select: { id: true, name: true } },
            visitDoneBy: { select: { id: true, firstName: true, lastName: true } },
            meetingDoneBy: { select: { id: true, firstName: true, lastName: true } },
            remarks: {
              orderBy: { createdAt: 'asc' },
              include: {
                createdBy: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        project: true,
        fieldValues: { include: { fieldDefinition: true } },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const customFields = await this.fieldDefinitionsService.getFieldValues(lead.id);
    return { ...lead, customFields };
  }

  // ════════════════════════════════════════════════════════════
  // ADD QUERY — cache invalidation added
  // ════════════════════════════════════════════════════════════

  async addQuery(
    companyId: string,
    leadId: string,
    createdById: string,
    dto: CreateQueryDto,
    designation: Designation,
  ) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, companyId } });
    if (!lead) throw new NotFoundException('Lead not found');

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { requireQueryPermission: true },
    });

    if (company?.requireQueryPermission) {
      const existingQuery = await this.prisma.leadQuery.findFirst({
        where: { leadId, createdById },
      });

      if (existingQuery) {
        const approval = await this.prisma.queryPermissionRequest.findFirst({
          where: {
            leadId,
            requestedById: createdById,
            status: 'APPROVED',
            expiresAt: { gte: new Date() },
          },
        });

        if (!approval) {
          throw new ForbiddenException(
            'QUERY_PERMISSION_REQUIRED: You need admin approval to add another query to this lead',
          );
        }

        await this.prisma.queryPermissionRequest.update({
          where: { id: approval.id },
          data: { expiresAt: new Date() },
        });
      }
    }

    const finalRemark = dto.remark?.trim() || AUTO_REMARKS[dto.status] || null;
    const isAutoRemark = !dto.remark?.trim();

    const result = await this.prisma.$transaction(async (tx) => {
      const query = await tx.leadQuery.create({
        data: {
          leadId,
          createdById,
          status: dto.status,
          remark: finalRemark,
          isAutoRemark,
          followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
          visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
          meetingDate: dto.meetingDate ? new Date(dto.meetingDate) : undefined,
          dealDoneDate: dto.dealDoneDate ? new Date(dto.dealDoneDate) : undefined,
          expVisitDate: dto.expVisitDate ? new Date(dto.expVisitDate) : undefined,
          shiftingDate: dto.shiftingDate ? new Date(dto.shiftingDate) : undefined,
          leadType: dto.leadType ?? undefined,
          bhk: dto.bhk ?? undefined,
          size: dto.size ?? undefined,
          floor: dto.floor ?? undefined,
          location: dto.location ?? undefined,
          purpose: dto.purpose ?? undefined,
          furnishingType: dto.furnishingType ?? undefined,
          projectId: dto.projectId ?? undefined,
          budgetMin: dto.budgetMin ?? undefined,
          budgetMax: dto.budgetMax ?? undefined,
          budgetUnit: dto.budgetUnit ?? undefined,
          visitDoneById: dto.visitDoneById ?? undefined,
          meetingDoneById: dto.meetingDoneById ?? undefined,
          closingAmount: dto.closingAmount ?? undefined,
          unitNo: dto.unitNo ?? undefined,
          reason: dto.reason ?? undefined,
          ...(designation === Designation.ADMIN
            ? {
                leadActualSlab: dto.leadActualSlab ?? undefined,
                discount: dto.discount ?? undefined,
                actualRevenue: dto.actualRevenue ?? undefined,
                incentiveSlab: dto.incentiveSlab ?? undefined,
                sellRevenue: dto.sellRevenue ?? undefined,
              }
            : {}),
        },
      });

      await tx.lead.update({
        where: { id: leadId },
        data: {
          ...(createdById === lead.assignedToId ? { isFresh: false } : {}),
          status: dto.status,
          lastActivityAt: new Date(),
          ...(dto.status === 'DEAL_DONE' ? { dealDoneAt: new Date() } : {}),
          ...(dto.projectId ? { projectId: dto.projectId } : {}),
          ...(dto.budgetMin ? { budgetMin: dto.budgetMin } : {}),
          ...(dto.budgetMax ? { budgetMax: dto.budgetMax } : {}),
          ...(dto.budgetUnit ? { budgetUnit: dto.budgetUnit } : {}),
        },
      });

      if (dto.status === 'DEAL_DONE') {
        await tx.customer.upsert({
          where: { leadId },
          create: {
            companyId,
            leadId,
            name: lead.name,
            phone: lead.phone,
            email: lead.email ?? undefined,
            source: lead.source ?? undefined,
            createdById,
            assignedToId: lead.assignedToId ?? undefined,
          },
          update: {},
        });
      }

      return query;
    });

    // Invalidate tab counts cache — lead status changed
    this.invalidateTabCountsCache(companyId);

    try {
      await this.targetsService.incrementAchieved(createdById, companyId, 'callsAchieved');
      if (dto.status === LeadStatus.VISIT_DONE)
        await this.targetsService.incrementAchieved(createdById, companyId, 'visitsAchieved');
      if (dto.status === LeadStatus.MEETING_DONE)
        await this.targetsService.incrementAchieved(createdById, companyId, 'meetingsAchieved');
      if (dto.status === LeadStatus.DEAL_DONE)
        await this.targetsService.incrementAchieved(createdById, companyId, 'dealsAchieved');
    } catch (err: any) {
      this.logger.warn(`Target increment failed for ${createdById}: ${err.message}`);
    }

    if (dto.status === LeadStatus.DEAL_DONE) {
      try {
        const creator = await this.prisma.employee.findFirst({
          where: { id: createdById },
          select: { firstName: true, lastName: true },
        });
        const creatorName = creator
          ? `${creator.firstName} ${creator.lastName ?? ''}`.trim()
          : 'An employee';
        const projectName = dto.projectId
          ? (
              await this.prisma.project.findUnique({
                where: { id: dto.projectId },
                select: { name: true },
              })
            )?.name ?? ''
          : '';

        const allEmployees = await this.prisma.employee.findMany({
          where: { companyId, isActive: true },
          select: { id: true },
        });

        await this.notificationService.notifyTeam(
          companyId,
          allEmployees.map((e) => e.id),
          NotificationType.SALE_DONE,
          `🎉 New Sale by ${creatorName}!`,
          `${creatorName} just closed a deal${projectName ? ` for ${projectName}` : ''} with ${lead.name}.${dto.closingAmount ? ` Amount: ₹${dto.closingAmount.toLocaleString('en-IN')}` : ''}`,
          { employeeId: createdById, leadId, closingAmount: dto.closingAmount ?? null },
        );
      } catch (err: any) {
        this.logger.warn(`Deal-done notification failed: ${err.message}`);
      }
    }

    return result;
  }

  // ════════════════════════════════════════════════════════════
  // UPDATE QUERY — cache invalidation added
  // ════════════════════════════════════════════════════════════

  async updateQuery(
    companyId: string,
    leadId: string,
    queryId: string,
    requestingEmployeeId: string,
    dto: UpdateQueryDto,
    designation: Designation,
  ) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, companyId } });
    if (!lead) throw new NotFoundException('Lead not found');

    const query = await this.prisma.leadQuery.findFirst({ where: { id: queryId, leadId } });
    if (!query) throw new NotFoundException('Query not found');

    if (designation !== Designation.ADMIN && query.createdById !== requestingEmployeeId) {
      throw new ForbiddenException('Only admin or the query creator can edit this query');
    }

    const updated = await this.prisma.leadQuery.update({
      where: { id: queryId },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.remark !== undefined && { remark: dto.remark, isAutoRemark: false }),
        ...(dto.followUpDate !== undefined && {
          followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
        }),
        ...(dto.visitDate !== undefined && {
          visitDate: dto.visitDate ? new Date(dto.visitDate) : null,
        }),
        ...(dto.meetingDate !== undefined && {
          meetingDate: dto.meetingDate ? new Date(dto.meetingDate) : null,
        }),
        ...(dto.dealDoneDate !== undefined && {
          dealDoneDate: dto.dealDoneDate ? new Date(dto.dealDoneDate) : null,
        }),
        ...(dto.expVisitDate !== undefined && {
          expVisitDate: dto.expVisitDate ? new Date(dto.expVisitDate) : null,
        }),
        ...(dto.shiftingDate !== undefined && {
          shiftingDate: dto.shiftingDate ? new Date(dto.shiftingDate) : null,
        }),
        ...(dto.leadType !== undefined && { leadType: dto.leadType }),
        ...(dto.bhk !== undefined && { bhk: dto.bhk }),
        ...(dto.size !== undefined && { size: dto.size }),
        ...(dto.floor !== undefined && { floor: dto.floor }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.purpose !== undefined && { purpose: dto.purpose }),
        ...(dto.furnishingType !== undefined && { furnishingType: dto.furnishingType }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId }),
        ...(dto.budgetMin !== undefined && { budgetMin: dto.budgetMin }),
        ...(dto.budgetMax !== undefined && { budgetMax: dto.budgetMax }),
        ...(dto.budgetUnit !== undefined && { budgetUnit: dto.budgetUnit }),
        ...(dto.visitDoneById !== undefined && { visitDoneById: dto.visitDoneById }),
        ...(dto.meetingDoneById !== undefined && { meetingDoneById: dto.meetingDoneById }),
        ...(dto.closingAmount !== undefined && { closingAmount: dto.closingAmount }),
        ...(dto.unitNo !== undefined && { unitNo: dto.unitNo }),
        ...(dto.reason !== undefined && { reason: dto.reason }),
        ...(designation === Designation.ADMIN
          ? {
              ...(dto.leadActualSlab !== undefined && { leadActualSlab: dto.leadActualSlab }),
              ...(dto.discount !== undefined && { discount: dto.discount }),
              ...(dto.actualRevenue !== undefined && { actualRevenue: dto.actualRevenue }),
              ...(dto.incentiveSlab !== undefined && { incentiveSlab: dto.incentiveSlab }),
              ...(dto.sellRevenue !== undefined && { sellRevenue: dto.sellRevenue }),
            }
          : {}),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        visitDoneBy: { select: { id: true, firstName: true, lastName: true } },
        meetingDoneBy: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true } },
        remarks: {
          orderBy: { createdAt: 'asc' },
          include: {
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (dto.status) {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { status: dto.status, lastActivityAt: new Date() },
      });

      if (dto.status === LeadStatus.DEAL_DONE) {
        const freshLead = await this.prisma.lead.findFirst({
          where: { id: leadId },
          select: {
            name: true,
            phone: true,
            email: true,
            source: true,
            assignedToId: true,
            companyId: true,
          },
        });
        if (freshLead) {
          await this.prisma.customer.upsert({
            where: { leadId },
            create: {
              companyId: freshLead.companyId,
              leadId,
              name: freshLead.name,
              phone: freshLead.phone,
              email: freshLead.email ?? undefined,
              source: freshLead.source ?? undefined,
              createdById: requestingEmployeeId,
              assignedToId: freshLead.assignedToId ?? undefined,
            },
            update: {},
          });
        }
      }

      // Invalidate tab counts cache — lead status changed
      this.invalidateTabCountsCache(companyId);
    }

    return updated;
  }

  // ════════════════════════════════════════════════════════════
  // ADD REMARK — unchanged (only updates lastActivityAt, not status)
  // ════════════════════════════════════════════════════════════

  async addRemark(
    companyId: string,
    leadId: string,
    queryId: string,
    createdById: string,
    dto: CreateRemarkDto,
  ) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, companyId } });
    if (!lead) throw new NotFoundException('Lead not found');

    const query = await this.prisma.leadQuery.findFirst({ where: { id: queryId, leadId } });
    if (!query) throw new NotFoundException('Query not found');

    if (!dto.text?.trim()) throw new BadRequestException('Remark text is required');

    const remark = await this.prisma.queryRemark.create({
      data: { queryId, createdById, text: dto.text.trim() },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { lastActivityAt: new Date() },
    });

    return remark;
  }

  // ════════════════════════════════════════════════════════════
  // QUERY PERMISSION REQUESTS — unchanged
  // ════════════════════════════════════════════════════════════

  async requestQueryPermission(companyId: string, leadId: string, requestedById: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, companyId } });
    if (!lead) throw new NotFoundException('Lead not found');

    const existing = await this.prisma.queryPermissionRequest.findFirst({
      where: { leadId, requestedById, status: 'PENDING' },
    });
    if (existing) {
      return { message: 'Permission request already pending', requestId: existing.id };
    }

    const request = await this.prisma.queryPermissionRequest.create({
      data: { companyId, leadId, requestedById, status: 'PENDING' },
    });

    return { message: 'Permission request submitted', requestId: request.id };
  }

  async getPendingPermissionRequests(
    companyId: string,
    designation: Designation,
    page = 1,
    limit = 20,
  ) {
    if (designation !== Designation.ADMIN) {
      throw new ForbiddenException('Only admin can view permission requests');
    }

    const skip = (page - 1) * limit;
    const [total, requests] = await Promise.all([
      this.prisma.queryPermissionRequest.count({ where: { companyId, status: 'PENDING' } }),
      this.prisma.queryPermissionRequest.findMany({
        where: { companyId, status: 'PENDING' },
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          lead: { select: { id: true, name: true, phone: true, status: true } },
          requestedBy: {
            select: { id: true, firstName: true, lastName: true, designation: true },
          },
        },
      }),
    ]);

    return buildPaginatedResult(requests, total, page, limit);
  }

  async approveQueryPermission(
    companyId: string,
    requestId: string,
    approverId: string,
    designation: Designation,
    approve: boolean,
    rejectionNote?: string,
  ) {
    if (designation !== Designation.ADMIN) {
      throw new ForbiddenException('Only admin can approve/reject permission requests');
    }

    const request = await this.prisma.queryPermissionRequest.findFirst({
      where: { id: requestId, companyId, status: 'PENDING' },
    });
    if (!request) throw new NotFoundException('Permission request not found or already actioned');

    const expiresAt = approve ? new Date(Date.now() + 60 * 60 * 1000) : undefined;

    return this.prisma.queryPermissionRequest.update({
      where: { id: requestId },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        approvedById: approverId,
        approvedAt: new Date(),
        expiresAt,
        rejectionNote: rejectionNote ?? null,
      },
    });
  }

  // ════════════════════════════════════════════════════════════
  // ASSIGN — cache invalidation added
  // ════════════════════════════════════════════════════════════

  async assignLead(
    companyId: string,
    leadId: string,
    assignedToId: string,
    requestingUser: any,
  ) {
    const scopeIds = getScopeIds(requestingUser);
    if (scopeIds && !scopeIds.includes(assignedToId)) {
      throw new ForbiddenException('Cannot assign to user outside your hierarchy');
    }

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, companyId },
      select: { name: true, assignedToId: true },
    });

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        assignedToId,
        isFresh: true,
        status: LeadStatus.FRESH,
        assignedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    this.invalidateTabCountsCache(companyId);

    try {
      const assigner = await this.prisma.employee.findFirst({
        where: { id: requestingUser.employeeId },
        select: { firstName: true, lastName: true },
      });
      const assignerName = assigner
        ? `${assigner.firstName} ${assigner.lastName ?? ''}`.trim()
        : 'Admin';

      await this.notificationService.notifyEmployee(
        companyId,
        assignedToId,
        NotificationType.LEAD_ASSIGNED,
        'New Lead Assigned',
        `${assignerName} assigned you a new lead: ${lead?.name ?? 'Unknown'}.`,
        { leadId, assignedBy: requestingUser.employeeId },
      );

      if (lead?.assignedToId && lead.assignedToId !== assignedToId) {
        const newOwner = await this.prisma.employee.findFirst({
          where: { id: assignedToId },
          select: { firstName: true, lastName: true },
        });
        const newOwnerName = newOwner
          ? `${newOwner.firstName} ${newOwner.lastName ?? ''}`.trim()
          : 'another employee';

        await this.notificationService.notifyEmployee(
          companyId,
          lead.assignedToId,
          NotificationType.LEAD_ASSIGNED,
          'Lead Transferred',
          `Your lead "${lead.name}" has been transferred to ${newOwnerName} by ${assignerName}.`,
          { leadId, newAssignedTo: assignedToId, assignedBy: requestingUser.employeeId },
        );
      }
    } catch (err: any) {
      this.logger.warn(`Lead-assign notification failed: ${err.message}`);
    }

    return updated;
  }

  async bulkAssign(
    companyId: string,
    leadIds: string[],
    assignedToId: string,
    requestingUser: any,
  ) {
    const scopeIds = getScopeIds(requestingUser);
    if (scopeIds && !scopeIds.includes(assignedToId)) {
      throw new ForbiddenException('Cannot assign to user outside your hierarchy');
    }

    const result = await this.prisma.lead.updateMany({
      where: { id: { in: leadIds }, companyId },
      data: {
        assignedToId,
        isFresh: true,
        status: LeadStatus.FRESH,
        assignedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    this.invalidateTabCountsCache(companyId);

    try {
      const assigner = await this.prisma.employee.findFirst({
        where: { id: requestingUser.employeeId },
        select: { firstName: true, lastName: true },
      });
      const assignerName = assigner
        ? `${assigner.firstName} ${assigner.lastName ?? ''}`.trim()
        : 'Admin';

      await this.notificationService.notifyEmployee(
        companyId,
        assignedToId,
        NotificationType.LEAD_ASSIGNED,
        `${result.count} New Leads Assigned`,
        `${assignerName} assigned you ${result.count} new lead${result.count > 1 ? 's' : ''}.`,
        { leadIds, assignedBy: requestingUser.employeeId, count: result.count },
      );
    } catch (err: any) {
      this.logger.warn(`Bulk-assign notification failed: ${err.message}`);
    }

    return { updated: result.count };
  }

  // ════════════════════════════════════════════════════════════
  // HOMEPAGE HELPERS — unchanged
  // ════════════════════════════════════════════════════════════

  async getTodaysFollowups(companyId: string, employeeId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.leadQuery.findMany({
      where: {
        createdById: employeeId,
        followUpDate: { gte: today, lt: tomorrow },
        lead: { companyId, isActive: true },
      },
      include: { lead: { select: { id: true, name: true, phone: true, status: true } } },
      orderBy: { followUpDate: 'asc' },
    });
  }

  async getNotificationStripData(
    companyId: string,
    user: { employeeId: string; designation: Designation; subordinateIds: string[] },
  ) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const scopeIds = getScopeIds(user);
    const isAdmin = user.designation === Designation.ADMIN;

    const employees = await this.prisma.employee.findMany({
      where: {
        companyId,
        isActive: true,
        ...(isAdmin ? {} : { id: { in: scopeIds ?? [] } }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        assignedLeads: {
          where: { status: LeadStatus.DEAL_DONE, dealDoneAt: { gte: sevenDaysAgo } },
          select: { id: true, dealDoneAt: true },
          take: 1,
          orderBy: { dealDoneAt: 'desc' },
        },
      },
    });

    return employees.map((emp) => {
      const lastDeal = emp.assignedLeads[0];
      return {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName ?? ''}`.trim(),
        hasSale: !!lastDeal,
        lastSaleAt: lastDeal?.dealDoneAt ?? null,
        showToAdmin: isAdmin,
      };
    });
  }

  // ════════════════════════════════════════════════════════════
  // LEGACY getLeads — unchanged
  // ════════════════════════════════════════════════════════════

  async getLeads(
    companyId: string,
    user: {
      employeeId: string;
      designation: Designation;
      subordinateIds: string[];
      permissions: any;
    },
    filter: LeadFilterDto,
  ) {
    const { page, limit, skip, take } = getPaginationParams(filter);
    const scopeIds = getScopeIds(user);
    const searchWhere = buildSearchWhere(filter.search);

    const where: Prisma.LeadWhereInput = {
      companyId,
      isActive: true,
      ...(scopeIds ? { assignedToId: { in: scopeIds } } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.assignedToId ? { assignedToId: filter.assignedToId } : {}),
      ...searchWhere,
      ...(filter.dateFrom || filter.dateTo
        ? {
            createdAt: {
              ...(filter.dateFrom ? { gte: new Date(filter.dateFrom) } : {}),
              ...(filter.dateTo ? { lte: new Date(filter.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take,
        include: {
          assignedTo: {
            select: { firstName: true, lastName: true, designation: true },
          },
          project: { select: { id: true, name: true } },
          _count: { select: { queries: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return buildPaginatedResult(
      leads.map((l) => ({ ...l, totalQueries: (l as any)._count.queries })),
      total,
      page,
      limit,
    );
  }

  // ════════════════════════════════════════════════════════════
  // CRON JOBS — unchanged
  // ════════════════════════════════════════════════════════════

  @Cron('0 1 * * *', { name: 'auto-escalate-fresh-leads' })
  async autoEscalateFreshLeads() {
    this.logger.log('Running: autoEscalateFreshLeads');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const staleLeads = await this.prisma.lead.findMany({
      where: {
        status: LeadStatus.FRESH,
        assignedAt: { lte: thirtyDaysAgo },
        lastActivityAt: { lte: thirtyDaysAgo },
        isActive: true,
      },
      include: { assignedTo: { select: { reportingManagerId: true } } },
    });

    for (const lead of staleLeads) {
      const managerId = lead.assignedTo?.reportingManagerId;
      if (!managerId) continue;
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { assignedToId: managerId, assignedAt: new Date(), status: LeadStatus.FRESH },
      });

      try {
        await this.notificationService.notifyEmployee(
          lead.companyId,
          managerId,
          NotificationType.LEAD_ASSIGNED,
          'Lead Escalated to You',
          `Lead "${lead.name}" has been auto-escalated to you due to 30+ days of inactivity.`,
          { leadId: lead.id, reason: 'auto_escalation' },
        );
      } catch (err: any) {
        this.logger.warn(
          `Escalation notification failed for lead ${lead.id}: ${err.message}`,
        );
      }
    }
    this.logger.log(`Auto-escalated ${staleLeads.length} leads`);
  }

  @Cron('0 8 * * *', { name: 'birthday-anniversary-notifications' })
  async sendSpecialDayNotifications() {
    const today = new Date();
    const todayMD = `${today.getMonth() + 1}-${today.getDate()}`;
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    // ── 1. Employee birthdays/anniversaries ──────────────────────────────────
    const employees = await this.prisma.employee.findMany({
      where: { isActive: true },
      select: {
        id: true,
        companyId: true,
        firstName: true,
        lastName: true,
        birthday: true,
        marriageAnniversary: true,
      },
    });

    for (const emp of employees) {
      const fullName = `${emp.firstName} ${emp.lastName ?? ''}`.trim();
      const isBirthday =
        emp.birthday &&
        `${emp.birthday.getMonth() + 1}-${emp.birthday.getDate()}` === todayMD;
      const isAnniversary =
        emp.marriageAnniversary &&
        `${emp.marriageAnniversary.getMonth() + 1}-${emp.marriageAnniversary.getDate()}` ===
          todayMD;
      if (!isBirthday && !isAnniversary) continue;

      const notifType = isBirthday ? 'BIRTHDAY' : 'ANNIVERSARY';

      const alreadySent = await this.prisma.$queryRaw<{ count: string }[]>`
        SELECT COUNT(*)::text as count FROM notifications
        WHERE "companyId" = ${emp.companyId}
          AND type = ${notifType}::text::"NotificationType"
          AND "createdAt" >= ${todayStart} AND "createdAt" <= ${todayEnd}
          AND metadata->>'employeeId' = ${emp.id}
      `;
      if (parseInt(alreadySent[0]?.count ?? '0', 10) > 0) continue;

      const companyEmployees = await this.prisma.employee.findMany({
        where: { companyId: emp.companyId, isActive: true },
        select: { id: true },
      });

      await this.prisma.notification.create({
        data: {
          companyId: emp.companyId,
          type: notifType as any,
          title: isBirthday
            ? `🎂 Happy Birthday ${fullName}!`
            : `💍 Happy Anniversary ${fullName}!`,
          message: `Today is ${fullName}'s ${isBirthday ? 'birthday' : 'anniversary'}!`,
          metadata: { employeeId: emp.id },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          recipients: {
            createMany: {
              data: companyEmployees.map((ce) => ({ employeeId: ce.id })),
            },
          },
        },
      });
      this.logger.log(`Sent ${notifType} notification for employee ${fullName}`);
    }

    // ── 2. Lead birthdays/anniversaries ─────────────────────────────────────
    const leads = await this.prisma.lead.findMany({
      where: {
        isActive: true,
        OR: [
          { clientBirthday: { not: null } },
          { clientMarriageAnniversary: { not: null } },
        ],
      },
      select: {
        id: true,
        companyId: true,
        name: true,
        phone: true,
        assignedToId: true,
        clientBirthday: true,
        clientMarriageAnniversary: true,
      },
    });

    for (const lead of leads) {
      if (!lead.assignedToId) continue;

      const isBirthday =
        lead.clientBirthday &&
        `${lead.clientBirthday.getMonth() + 1}-${lead.clientBirthday.getDate()}` === todayMD;
      const isAnniversary =
        lead.clientMarriageAnniversary &&
        `${lead.clientMarriageAnniversary.getMonth() + 1}-${lead.clientMarriageAnniversary.getDate()}` ===
          todayMD;
      if (!isBirthday && !isAnniversary) continue;

      const notifType = isBirthday ? 'BIRTHDAY' : 'ANNIVERSARY';

      const alreadySent = await this.prisma.$queryRaw<{ count: string }[]>`
        SELECT COUNT(*)::text as count FROM notifications
        WHERE "companyId" = ${lead.companyId}
          AND type = ${notifType}::text::"NotificationType"
          AND "createdAt" >= ${todayStart} AND "createdAt" <= ${todayEnd}
          AND metadata->>'leadId' = ${lead.id}
      `;
      if (parseInt(alreadySent[0]?.count ?? '0', 10) > 0) continue;

      await this.prisma.notification.create({
        data: {
          companyId: lead.companyId,
          type: notifType as any,
          title: isBirthday
            ? `🎂 Client Birthday: ${lead.name}!`
            : `💍 Client Anniversary: ${lead.name}!`,
          message: `Today is your client ${lead.name}'s ${isBirthday ? 'birthday' : 'anniversary'}! Great time to reach out.`,
          metadata: {
            leadId: lead.id,
            leadName: lead.name,
            leadPhone: lead.phone,
            isLead: true,
          },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          recipients: {
            create: { employeeId: lead.assignedToId },
          },
        },
      });
      this.logger.log(`Sent ${notifType} notification for lead ${lead.name}`);
    }
  }

  // ════════════════════════════════════════════════════════════
  // GET TODAY'S LEAD CELEBRATIONS — unchanged
  // ════════════════════════════════════════════════════════════

  async getTodayCelebrations(companyId: string, employeeId: string) {
    const today = new Date();
    const todayMD = `${today.getMonth() + 1}-${today.getDate()}`;

    const leads = await this.prisma.lead.findMany({
      where: {
        companyId,
        isActive: true,
        assignedToId: employeeId,
        OR: [
          { clientBirthday: { not: null } },
          { clientMarriageAnniversary: { not: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        clientBirthday: true,
        clientMarriageAnniversary: true,
      },
    });

    const celebrations: Array<{
      type: 'BIRTHDAY' | 'ANNIVERSARY';
      isLead: boolean;
      leadId: string;
      name: string;
      phone: string;
    }> = [];

    for (const lead of leads) {
      if (
        lead.clientBirthday &&
        `${lead.clientBirthday.getMonth() + 1}-${lead.clientBirthday.getDate()}` === todayMD
      ) {
        celebrations.push({
          type: 'BIRTHDAY',
          isLead: true,
          leadId: lead.id,
          name: lead.name,
          phone: lead.phone,
        });
      }
      if (
        lead.clientMarriageAnniversary &&
        `${lead.clientMarriageAnniversary.getMonth() + 1}-${lead.clientMarriageAnniversary.getDate()}` ===
          todayMD
      ) {
        celebrations.push({
          type: 'ANNIVERSARY',
          isLead: true,
          leadId: lead.id,
          name: lead.name,
          phone: lead.phone,
        });
      }
    }

    return celebrations;
  }
}