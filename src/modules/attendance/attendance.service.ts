import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceStatus, Designation } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { IsNumber, IsOptional, IsString, IsEnum, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CheckInDto {
  @IsNumber()
  latitude: number;
 
  @IsNumber()
  longitude: number;
 
  @IsOptional()
  @IsNumber()
  accuracy?: number;
 
  // Resolved by the frontend before posting — stored immediately, no background geocoding needed
  @IsOptional()
  @IsString()
  address?: string;
}
 
export class CheckOutDto {
  @IsNumber()
  latitude: number;
 
  @IsNumber()
  longitude: number;
 
  @IsOptional()
  @IsNumber()
  accuracy?: number;
 
  @IsOptional()
  @IsString()
  address?: string;
}

export class ListAttendanceDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2000)
  year?: number;
}

export class MarkAttendanceDto {
  @IsString()
  employeeId: string;

  @IsDateString()
  date: string;

  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  // ── Helpers ───────────────────────────────────────────────

  private toNumber(val: unknown): number {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'object' && 'toNumber' in (val as object)) {
      return (val as { toNumber: () => number }).toNumber();
    }
    return Number(val);
  }

  private formatHoursString(val: unknown): string {
    if (val === null || val === undefined) return '—';
    const h = this.toNumber(val);
    if (h === 0) return '—';
    return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
  }

  private safeStatus(status: AttendanceStatus | null | undefined): AttendanceStatus | null {
    return status ?? null;
  }

  // ── Reverse geocode — NON-BLOCKING fire-and-update ────────────────────────
  //
  // IMPORTANT: Do NOT await this in check-in / check-out.
  // Call it as a background task after the DB record is already saved.
  // Nominatim can take 2-5s or time out entirely — we must never block
  // the HTTP response on an external geocoding call.
  //
  // Usage:
  //   const record = await prisma.attendance.create(...);
  //   this.geocodeAndUpdate(record.id, lat, lng, 'checkIn');  // fire & forget
  //   return record;  // responds immediately

  private async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Property360CRM/1.0' },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      // Prefer a shorter address: road + city instead of full display_name
      if (data.address) {
        const a = data.address;
        const parts = [
          a.road || a.pedestrian || a.footway,
          a.suburb || a.neighbourhood,
          a.city || a.town || a.village || a.county,
          a.state,
        ].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
      }
      return data.display_name ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Fire-and-forget: geocode in the background and patch the attendance record.
   * Called AFTER the attendance record is already returned to the client.
   */
  private geocodeAndUpdate(
    attendanceId: string,
    lat: number,
    lng: number,
    field: 'checkIn' | 'checkOut',
  ): void {
    this.reverseGeocode(lat, lng)
      .then((location) => {
        if (!location) return;
        const updateField =
          field === 'checkIn' ? { checkInLocation: location } : { checkOutLocation: location };
        return this.prisma.attendance.update({
          where: { id: attendanceId },
          data: updateField,
        });
      })
      .catch(() => {
        // Geocoding failed — not critical, location stays null in DB
      });
  }

  // ── Half-day / full-day calculation ───────────────────────

  private calculateStatus(
    checkInAt: Date,
    checkOutAt: Date,
  ): { status: AttendanceStatus; hoursWorked: number } {
    const diffMs = checkOutAt.getTime() - checkInAt.getTime();
    const hoursWorked = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
    const status: AttendanceStatus =
      hoursWorked >= 6 ? AttendanceStatus.PRESENT_FULL : AttendanceStatus.PRESENT_HALF;
    return { status, hoursWorked };
  }

  // ── Check In — FAST: saves immediately, geocodes in background ────────────

  async checkIn(companyId: string, employeeId: string, dto: CheckInDto) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    if (existing?.checkInAt) {
      throw new ConflictException('Already checked in today');
    }

    // ── Save to DB immediately (no geocoding wait) ──────────────────────────
    let record: Awaited<ReturnType<typeof this.prisma.attendance.update | typeof this.prisma.attendance.create>>;

    if (existing) {
      record = await this.prisma.attendance.update({
        where: { employeeId_date: { employeeId, date: today } },
        data: {
          checkInAt: new Date(),
          checkInLat: dto.latitude,
          checkInLng: dto.longitude,
          checkInLocation: null, // will be filled in background
        },
      });
    } else {
      record = await this.prisma.attendance.create({
        data: {
          companyId,
          employeeId,
          date: today,
          checkInAt: new Date(),
          checkInLat: dto.latitude,
          checkInLng: dto.longitude,
          checkInLocation: null, // will be filled in background
        },
      });
    }

    // ── Geocode in background — does NOT block response ─────────────────────
    if (dto.latitude && dto.longitude) {
      this.geocodeAndUpdate(record.id, dto.latitude, dto.longitude, 'checkIn');
    }

    return record;
  }

  // ── Check Out — FAST: saves immediately, geocodes in background ───────────

  async checkOut(companyId: string, employeeId: string, dto: CheckOutDto) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    if (!attendance?.checkInAt) {
      throw new BadRequestException('You have not checked in today');
    }
    if (attendance.checkOutAt) {
      throw new ConflictException('Already checked out today');
    }

    const checkOutAt = new Date();
    const { status, hoursWorked } = this.calculateStatus(attendance.checkInAt, checkOutAt);

    // ── Save to DB immediately (no geocoding wait) ──────────────────────────
    const record = await this.prisma.attendance.update({
      where: { employeeId_date: { employeeId, date: today } },
      data: {
        checkOutAt,
        checkOutLat: dto.latitude,
        checkOutLng: dto.longitude,
        checkOutLocation: null, // will be filled in background
        hoursWorked,
        status,
      },
    });

    // ── Geocode in background — does NOT block response ─────────────────────
    if (dto.latitude && dto.longitude) {
      this.geocodeAndUpdate(record.id, dto.latitude, dto.longitude, 'checkOut');
    }

    return record;
  }

  // ── Today status ──────────────────────────────────────────

  async getTodayStatus(employeeId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    return {
      date: today,
      checkedIn: !!attendance?.checkInAt,
      checkedOut: !!attendance?.checkOutAt,
      checkInAt: attendance?.checkInAt ?? null,
      checkOutAt: attendance?.checkOutAt ?? null,
      checkInLocation: attendance?.checkInLocation ?? null,
      checkOutLocation: attendance?.checkOutLocation ?? null,
      hoursWorked: attendance?.hoursWorked ? this.toNumber(attendance.hoursWorked) : null,
      status: attendance?.status ?? null,
    };
  }

  // ── My attendance history ─────────────────────────────────

  async getMyAttendance(employeeId: string, dto: ListAttendanceDto) {
    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(100, dto.limit ?? 30);
    const skip = (page - 1) * limit;
    const dateFilter = this.buildDateFilter(dto);
    const where: any = { employeeId, ...dateFilter };

    const [total, data] = await Promise.all([
      this.prisma.attendance.count({ where }),
      this.prisma.attendance.findMany({ where, skip, take: limit, orderBy: { date: 'desc' } }),
    ]);

    const summary = await this.prisma.attendance.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      summary: this.buildSummary(summary),
    };
  }

  // ── Team attendance (scoped) ──────────────────────────────

  async getAttendance(
    companyId: string,
    employeeId: string,
    designation: Designation,
    subordinateIds: string[],
    canViewAllAttendance: boolean,
    dto: ListAttendanceDto,
  ) {
    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(100, dto.limit ?? 30);
    const skip = (page - 1) * limit;

    const isAdmin = designation === Designation.ADMIN;
    const canViewAll = isAdmin || canViewAllAttendance;
    const scopeIds = canViewAll ? null : [employeeId, ...subordinateIds];
    const dateFilter = this.buildDateFilter(dto);

    const where: any = {
      companyId,
      ...dateFilter,
      ...(scopeIds ? { employeeId: { in: scopeIds } } : {}),
      ...(dto.employeeId && canViewAll ? { employeeId: dto.employeeId } : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.attendance.count({ where }),
      this.prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: 'desc' }, { employee: { firstName: 'asc' } }],
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, designation: true, avatar: true },
          },
        },
      }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Admin: mark attendance ────────────────────────────────

  async markAttendance(
    companyId: string,
    dto: MarkAttendanceDto,
    designation: Designation,
    canViewAllAttendance: boolean,
  ) {
    if (designation !== Designation.ADMIN && !canViewAllAttendance) {
      throw new ForbiddenException('Not authorized to mark attendance');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId, isActive: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    return this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: dto.employeeId, date } },
      update: { status: dto.status },
      create: { companyId, employeeId: dto.employeeId, date, status: dto.status },
    });
  }

  // ── Monthly summary ───────────────────────────────────────

  async getMonthlySummary(
    companyId: string,
    employeeId: string,
    designation: Designation,
    subordinateIds: string[],
    canViewAllAttendance: boolean,
    month: number,
    year: number,
  ) {
    const isAdmin = designation === Designation.ADMIN;
    const canViewAll = isAdmin || canViewAllAttendance;
    const scopeIds = canViewAll ? null : [employeeId, ...subordinateIds];

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const records = await this.prisma.attendance.findMany({
      where: {
        companyId,
        date: { gte: startDate, lte: endDate },
        ...(scopeIds ? { employeeId: { in: scopeIds } } : {}),
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, designation: true },
        },
      },
    });

    const byEmployee: Record<string, any> = {};
    for (const r of records) {
      const eid = r.employeeId;
      if (!byEmployee[eid]) {
        byEmployee[eid] = {
          employee: r.employee,
          fullDays: 0,
          halfDays: 0,
          absent: 0,
          totalHours: 0,
        };
      }
      if (r.status === AttendanceStatus.PRESENT_FULL) byEmployee[eid].fullDays++;
      else if (r.status === AttendanceStatus.PRESENT_HALF) byEmployee[eid].halfDays++;
      else if (r.status === AttendanceStatus.ABSENT) byEmployee[eid].absent++;
      byEmployee[eid].totalHours += this.toNumber(r.hoursWorked);
    }

    return Object.values(byEmployee);
  }

  // ── Export Excel ──────────────────────────────────────────

  async exportAttendance(
    companyId: string,
    employeeId: string,
    designation: Designation,
    subordinateIds: string[],
    canViewAllAttendance: boolean,
    dto: ListAttendanceDto,
    targetEmployeeId?: string,
  ): Promise<Buffer> {
    const isAdmin = designation === Designation.ADMIN;
    const canViewAll = isAdmin || canViewAllAttendance;
    const scopeIds = canViewAll ? null : [employeeId, ...subordinateIds];
    const dateFilter = this.buildDateFilter(dto);

    const where: any = {
      companyId,
      ...dateFilter,
      ...(scopeIds ? { employeeId: { in: scopeIds } } : {}),
      ...(targetEmployeeId ? { employeeId: targetEmployeeId } : {}),
    };

    const records = await this.prisma.attendance.findMany({
      where,
      orderBy: [{ employee: { firstName: 'asc' } }, { date: 'asc' }],
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, designation: true },
        },
      },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Property360 CRM';
    wb.created = new Date();

    const ws = wb.addWorksheet('Attendance', {
      views: [{ state: 'frozen', ySplit: 2 }],
    });

    ws.columns = [
      { key: 'employee',    width: 22 },
      { key: 'designation', width: 18 },
      { key: 'date',        width: 14 },
      { key: 'checkIn',     width: 12 },
      { key: 'checkInLoc',  width: 32 },
      { key: 'checkOut',    width: 12 },
      { key: 'checkOutLoc', width: 32 },
      { key: 'hours',       width: 14 },
      { key: 'status',      width: 14 },
    ];

    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    const monthLabel = dto.startDate
      ? new Date(dto.startDate).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
      : 'All Periods';
    titleCell.value = `Attendance Report — ${monthLabel}`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A0F2E' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 32;

    const columnHeaders = [
      'Employee', 'Designation', 'Date',
      'Check In', 'Check In Location',
      'Check Out', 'Check Out Location',
      'Hours Worked', 'Status',
    ];
    const headerRow = ws.getRow(2);
    columnHeaders.forEach((label, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = label;
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3D1F6B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCC0DC' } } };
    });
    headerRow.height = 26;

    const STATUS_COLOR: Partial<Record<AttendanceStatus, string>> = {
      [AttendanceStatus.PRESENT_FULL]: 'FF22C55E',
      [AttendanceStatus.PRESENT_HALF]: 'FFEAB308',
      [AttendanceStatus.ABSENT]:       'FFEF4444',
    };
    const STATUS_LABEL: Partial<Record<AttendanceStatus, string>> = {
      [AttendanceStatus.PRESENT_FULL]: 'Full Day',
      [AttendanceStatus.PRESENT_HALF]: 'Half Day',
      [AttendanceStatus.ABSENT]:       'Absent',
    };
    const EXTRA_COLOR: Record<string, string> = {
      FULL_DAY: 'FF22C55E',
      HALF_DAY: 'FFEAB308',
    };
    const EXTRA_LABEL: Record<string, string> = {
      FULL_DAY: 'Full Day',
      HALF_DAY: 'Half Day',
    };

    let totalHoursAll = 0;

    records.forEach((r, idx) => {
      const hoursNum = this.toNumber(r.hoursWorked);
      totalHoursAll += hoursNum;
      const hoursStr = r.hoursWorked != null ? this.formatHoursString(r.hoursWorked) : '—';

      const rawStatus = r.status as string | null;
      const statusStr = rawStatus
        ? (STATUS_LABEL[rawStatus as AttendanceStatus] ?? EXTRA_LABEL[rawStatus] ?? rawStatus)
        : '—';
      const statusArgb = rawStatus
        ? (STATUS_COLOR[rawStatus as AttendanceStatus] ?? EXTRA_COLOR[rawStatus] ?? null)
        : null;

      const row = ws.addRow({
        employee:    r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : r.employeeId,
        designation: r.employee?.designation ?? '',
        date:        new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        checkIn:     r.checkInAt  ? new Date(r.checkInAt).toLocaleTimeString('en-IN',  { hour: '2-digit', minute: '2-digit' }) : '—',
        checkInLoc:  r.checkInLocation  ?? '—',
        checkOut:    r.checkOutAt ? new Date(r.checkOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—',
        checkOutLoc: r.checkOutLocation ?? '—',
        hours:       hoursStr,
        status:      statusStr,
      });

      row.height = 20;
      const bgArgb = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9F7FC';

      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
        cell.font = { size: 10 };
        cell.alignment = {
          vertical: 'middle',
          horizontal: (colNum === 5 || colNum === 7) ? 'left' : 'center',
          wrapText: false,
        };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5DFF0' } } };
      });

      if (statusArgb) {
        const statusCell = row.getCell(9);
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusArgb } };
        statusCell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });

    ws.addRow([]);
    const totalRow = ws.addRow([
      'TOTAL', '', `${records.length} records`, '', '', '', '',
      this.formatHoursString(totalHoursAll), '',
    ]);
    totalRow.height = 22;
    [1, 3, 8].forEach((col) => {
      const cell = totalRow.getCell(col);
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A0F2E' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ── Date filter builder ───────────────────────────────────

  private buildDateFilter(dto: ListAttendanceDto) {
    if (dto.month && dto.year) {
      const startDate = new Date(dto.year, dto.month - 1, 1);
      const endDate   = new Date(dto.year, dto.month, 0, 23, 59, 59);
      return { date: { gte: startDate, lte: endDate } };
    }
    if (dto.startDate || dto.endDate) {
      return {
        date: {
          ...(dto.startDate ? { gte: new Date(dto.startDate) } : {}),
          ...(dto.endDate   ? { lte: new Date(dto.endDate)   } : {}),
        },
      };
    }
    return {};
  }

  private buildSummary(
    groupBy: Array<{ status: AttendanceStatus | null; _count: number }>,
  ) {
    const result = { fullDays: 0, halfDays: 0, absent: 0, total: 0 };
    for (const g of groupBy) {
      if (g.status === AttendanceStatus.PRESENT_FULL) result.fullDays = g._count;
      else if (g.status === AttendanceStatus.PRESENT_HALF) result.halfDays = g._count;
      else if (g.status === AttendanceStatus.ABSENT) result.absent = g._count;
      result.total += g._count;
    }
    return result;
  }
}