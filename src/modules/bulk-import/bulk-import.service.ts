import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LeadStatus, LeadSource, LeadType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

// BulkImport schema fields:
//   id, companyId, uploadedById, fileName, totalRows,
//   successRows, failedRows, errors (Json), fileUrl, createdAt
//   leads Lead[]
// NOTE: no status, no completedAt, no uploadedBy relation

interface ParsedRow {
  rowNumber: number;
  name?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  address?: string;
  source?: string;
  type?: string;
  projectName?: string;
  assignedToPhone?: string;
  errors: string[];
}

export interface ImportResult {
  importId: string;
  total: number;
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

const HEADER_MAP: Record<string, string> = {
  'name': 'name',
  'full name': 'name',
  'client name': 'name',
  'phone': 'phone',
  'mobile': 'phone',
  'phone number': 'phone',
  'mobile number': 'phone',
  'phone2': 'phone2',
  'alternate phone': 'phone2',
  'alternate mobile': 'phone2',
  'email': 'email',
  'email address': 'email',
  'address': 'address',
  'location': 'address',
  'source': 'source',
  'lead source': 'source',
  'type': 'type',
  'lead type': 'type',
  'property type': 'type',
  'project': 'projectName',
  'project name': 'projectName',
  'assigned to': 'assignedToPhone',
  'assigned employee': 'assignedToPhone',
  'employee phone': 'assignedToPhone',
};

// Valid LeadType values from schema enum
const VALID_LEAD_TYPES = new Set(Object.values(LeadType));

@Injectable()
export class BulkImportService {
  constructor(private prisma: PrismaService) {}

  // ── Download Excel template ───────────────────────────────
  async getImportTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leads');

    sheet.columns = [
      { header: 'Name *', key: 'name', width: 25 },
      { header: 'Phone *', key: 'phone', width: 18 },
      { header: 'Alternate Phone', key: 'phone2', width: 18 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Address', key: 'address', width: 35 },
      { header: 'Source', key: 'source', width: 20 },
      { header: 'Type', key: 'type', width: 20 },
      { header: 'Project Name', key: 'projectName', width: 25 },
      { header: 'Assigned To (Employee Phone)', key: 'assignedToPhone', width: 32 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2EFDA' },
    };

    sheet.addRow({
      name: 'Rahul Sharma',
      phone: '9876543210',
      phone2: '',
      email: 'rahul@example.com',
      address: 'Delhi',
      source: 'WEBSITE',
      type: 'RESIDENTIAL',
      projectName: '',
      assignedToPhone: '',
    });

    const notesSheet = workbook.addWorksheet('Notes');
    notesSheet.addRow(['Field', 'Required', 'Valid Values / Notes']);
    notesSheet.addRow(['Name', 'Yes', 'Any text']);
    notesSheet.addRow(['Phone', 'Yes', '10-digit mobile number']);
    notesSheet.addRow(['Source', 'No', Object.values(LeadSource).join(', ')]);
    notesSheet.addRow(['Type', 'No', Object.values(LeadType).join(', ')]);
    notesSheet.addRow(['Assigned To', 'No', 'Employee mobile number for auto-assign']);
    notesSheet.getRow(1).font = { bold: true };

    // writeBuffer returns Buffer | ArrayBuffer depending on exceljs version
    const raw = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
  }

  // ── Import history ────────────────────────────────────────
  async getImportHistory(companyId: string) {
    // No uploadedBy relation in schema — return raw records
    return this.prisma.bulkImport.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fileName: true,
        totalRows: true,
        successRows: true,
        failedRows: true,
        createdAt: true,
        uploadedById: true,
      },
    });
  }

  // ── Main import ───────────────────────────────────────────
  async importLeads(
    companyId: string,
    uploadedById: string,
    fileBuffer: Buffer,
    fileName: string,
    defaultAssignedToId?: string,
  ): Promise<ImportResult> {
    const rows = await this.parseExcel(fileBuffer);
    if (!rows.length) {
      throw new BadRequestException('No data rows found in the file');
    }

    // Create import record upfront
    const bulkImport = await this.prisma.bulkImport.create({
      data: {
        companyId,
        uploadedById,
        fileName,
        totalRows: rows.length,
        successRows: 0,
        failedRows: 0,
      },
    });

    // Load existing phones for duplicate detection
    const existingPhones = new Set(
      (
        await this.prisma.lead.findMany({
          where: { companyId, isActive: true },
          select: { phone: true },
        })
      ).map((l) => l.phone),
    );

    // Load lookup tables
    const [projects, employees] = await Promise.all([
      this.prisma.project.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.employee.findMany({
        where: { companyId, isActive: true },
        select: { id: true, phone: true },
      }),
    ]);

    const projectMap = new Map(
      projects.map((p) => [p.name.toLowerCase().trim(), p.id]),
    );
    const employeeByPhone = new Map(
      employees
        .filter((e) => e.phone)
        .map((e) => [e.phone!.replace(/\D/g, '').slice(-10), e.id]),
    );

    // Process rows
    const importErrors: Array<{ row: number; reason: string }> = [];
    let created = 0;
    let skipped = 0;
    const BATCH_SIZE = 100;

    type ValidRow = {
      name: string;
      phone: string;
      phone2?: string;
      email?: string;
      address?: string;
      source: LeadSource | null;
      type: LeadType;
      projectId?: string;
      assignedToId: string;
    };
    const validRows: ValidRow[] = [];

    for (const row of rows) {
      if (row.errors.length) {
        importErrors.push(...row.errors.map((e) => ({ row: row.rowNumber, reason: e })));
        continue;
      }

      const phone = row.phone!.replace(/\D/g, '').slice(-10);

      if (existingPhones.has(phone)) {
        skipped++;
        continue;
      }
      existingPhones.add(phone);

      const projectId = row.projectName
        ? projectMap.get(row.projectName.toLowerCase().trim())
        : undefined;

      let assignedToId = defaultAssignedToId ?? uploadedById;
      if (row.assignedToPhone) {
        const normalized = row.assignedToPhone.replace(/\D/g, '').slice(-10);
        const empId = employeeByPhone.get(normalized);
        if (empId) assignedToId = empId;
      }

      validRows.push({
        name: row.name!,
        phone,
        phone2: row.phone2 || undefined,
        email: row.email?.toLowerCase() || undefined,
        address: row.address || undefined,
        source: this.normalizeSource(row.source),
        type: this.normalizeLeadType(row.type),
        projectId,
        assignedToId,
      });
    }

    // Batch insert
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      try {
        await this.prisma.lead.createMany({
          data: batch.map((row) => ({
            companyId,
            createdById: uploadedById,
            bulkImportId: bulkImport.id,
            name: row.name,
            phone: row.phone,
            phone2: row.phone2 ?? null,
            email: row.email ?? null,
            address: row.address ?? null,
            source: row.source,
            type: row.type,
            projectId: row.projectId ?? null,
            assignedToId: row.assignedToId,
            status: LeadStatus.FRESH,
            assignedAt: new Date(),
            lastActivityAt: new Date(),
          })),
          skipDuplicates: true,
        });
        created += batch.length;
      } catch (err: any) {
        importErrors.push({ row: i + 1, reason: `Batch insert failed: ${err.message}` });
      }
    }

    // Update import record — only fields that exist in schema
    await this.prisma.bulkImport.update({
      where: { id: bulkImport.id },
      data: {
        successRows: created,
        failedRows: importErrors.length,
        errors: importErrors.length
          ? (importErrors.slice(0, 200) as any)
          : null,
      },
    });

    return {
      importId: bulkImport.id,
      total: rows.length,
      created,
      skipped,
      failed: importErrors.length,
      errors: importErrors.slice(0, 50),
    };
  }

  // ── Excel parser ──────────────────────────────────────────
  private async parseExcel(buffer: Buffer): Promise<ParsedRow[]> {
  // Read the workbook using xlsx
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  
  // Get first sheet
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Convert to JSON
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1,
    defval: '',
    blankrows: false 
  }) as any[][];

  if (jsonData.length < 2) {
    throw new BadRequestException('File must contain header row and at least one data row');
  }

  const rows: ParsedRow[] = [];
  
  // Map headers (first row)
  const headers = jsonData[0].map(h =>
  String(h || '')
    .toLowerCase()
    .trim()
    .replace(/\s*\*\s*$/, '')          // remove trailing " *"
    .replace(/\s*\(.*?\)\s*$/, '')     // remove trailing "(anything)"
    .trim()
);
  const headerIndices: Record<number, string> = {};
  
  headers.forEach((header, index) => {
    const key = HEADER_MAP[header];
    if (key) {
      headerIndices[index + 1] = key; // +1 because Excel columns are 1-indexed in our parser
    }
  });

  // Process data rows (starting from index 1)
  for (let i = 1; i < jsonData.length; i++) {
    const rowData = jsonData[i];
    const rowNumber = i + 1; // +1 because we want Excel row numbers
    
    // Skip empty rows
    if (!rowData.some(cell => cell && String(cell).trim() !== '')) {
      continue;
    }

    const parsed: ParsedRow = { rowNumber, errors: [] };

    // Map data based on headers
    for (const [colIndexStr, fieldName] of Object.entries(headerIndices)) {
      const colIndex = parseInt(colIndexStr, 10) - 1; // Convert back to 0-index for array
      const cellValue = rowData[colIndex];
      
      if (cellValue !== undefined && cellValue !== null) {
        const stringValue = String(cellValue).trim();
        if (stringValue) {
          (parsed as any)[fieldName] = stringValue;
        }
      }
    }

    // Validate
    if (!parsed.name?.trim()) {
      parsed.errors.push('Name is required');
    }

    if (!parsed.phone?.trim()) {
      parsed.errors.push('Phone is required');
    } else {
      const digits = parsed.phone.replace(/\D/g, '');
      if (digits.length < 10) {
        parsed.errors.push(`Invalid phone number: ${parsed.phone}`);
      }
    }

    if (parsed.email && parsed.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(parsed.email)) {
        parsed.errors.push(`Invalid email format: ${parsed.email}`);
      }
    }

    rows.push(parsed);
  }

  return rows;
}

  // ── Normalize enums ───────────────────────────────────────
  private normalizeSource(raw?: string): LeadSource | null {
    if (!raw) return null;
    const upper = raw.toUpperCase().replace(/\s+/g, '_') as LeadSource;
    return Object.values(LeadSource).includes(upper) ? upper : LeadSource.BULK_IMPORT;
  }

  private normalizeLeadType(raw?: string): LeadType {
    if (!raw) return LeadType.RESIDENTIAL;
    const upper = raw.toUpperCase().replace(/\s+/g, '_') as LeadType;
    return VALID_LEAD_TYPES.has(upper) ? upper : LeadType.RESIDENTIAL;
  }
}