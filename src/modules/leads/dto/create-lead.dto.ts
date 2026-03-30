// ============================================================
// src/modules/leads/dto/create-lead.dto.ts
// ============================================================
import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsNumber,
  IsDateString,
  IsBoolean,
  IsPositive,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadSource, LeadType, LeadStatus, FurnishingType } from '@prisma/client';

// ── Unchanged ──────────────────────────────────────────────────────────────────

export class CreateLeadDto {
  @IsString() name: string;

  @IsString()
  @Matches(/^[0-9+\-\s()]{8,15}$/, { message: 'Invalid phone number' })
  phone: string;

  @IsOptional() @IsEmail()          email?: string;
  @IsOptional() @IsString()         phone2?: string;
  @IsOptional() @IsString()         address?: string;
  @IsString()
@IsOptional()
@MaxLength(100)
source?: string;
  @IsOptional() @IsEnum(LeadType)   type?: LeadType;
  @IsOptional() @IsString()         assignedToId?: string;
  @IsOptional() @IsString()         projectId?: string;
  @IsOptional() @IsString()         clientBirthday?: string;
  @IsOptional() @IsString()         clientMarriageAnniversary?: string;
  customFields?: Record<string, any>;
}

export class UpdateLeadDto {
  @IsOptional() @IsString()         name?: string;
  @IsOptional() @IsString()         phone?: string;
  @IsOptional() @IsEmail()          email?: string;
  @IsOptional() @IsString()         address?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsEnum(LeadType)   type?: LeadType;
  @IsOptional() @IsString()         projectId?: string;
  @IsOptional() @IsString()         clientBirthday?: string;
  @IsOptional() @IsString()         clientMarriageAnniversary?: string;
}

// ── CHANGED: CreateQueryDto ────────────────────────────────────────────────────
// Key changes vs old version:
//   1. `callStatus: string` → `status: LeadStatus`  (renamed, now typed)
//   2. Date fields: `Date` → `string` with @IsDateString() (ISO 8601 strings)
//   3. Numeric fields get @Type(() => Number) for correct JSON coercion
//   4. New fields added: expVisitDate, shiftingDate, leadType, bhk, floor,
//      location, purpose, furnishingType, size, visitDoneById, meetingDoneById,
//      closingAmount, unitNo, reason, and admin-only financials

export class CreateQueryDto {
  // RENAMED from `callStatus` → `status`
  @IsEnum(LeadStatus)
  status: LeadStatus;

  @IsOptional() @IsString() remark?: string;

  // Dates — CHANGED from `Date` to `@IsDateString() string`
  @IsOptional() @IsDateString() followUpDate?: string;
  @IsOptional() @IsDateString() visitDate?: string;
  @IsOptional() @IsDateString() meetingDate?: string;
  @IsOptional() @IsDateString() dealDoneDate?: string;

  // NEW dates
  @IsOptional() @IsDateString() expVisitDate?: string;
  @IsOptional() @IsDateString() shiftingDate?: string;

  // NEW: lead interest details
  @IsOptional() @IsEnum(LeadType)       leadType?: LeadType;
  @IsOptional() @IsString()             bhk?: string;
  @IsOptional() @IsString()             floor?: string;
  @IsOptional() @IsString()             location?: string;
  @IsOptional() @IsString()             purpose?: string;
  @IsOptional() @IsEnum(FurnishingType) furnishingType?: FurnishingType;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() size?: number;

  // Budget — existing but added @Type() coercion
  @IsOptional() @IsString()                      projectId?: string;
  @IsOptional() @Type(() => Number) @IsNumber()  budgetMin?: number;
  @IsOptional() @Type(() => Number) @IsNumber()  budgetMax?: number;
  @IsOptional() @IsString()                      budgetUnit?: string;

  // NEW: participants
  @IsOptional() @IsString() visitDoneById?: string;
  @IsOptional() @IsString() meetingDoneById?: string;

  // NEW: deal done
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() closingAmount?: number;
  @IsOptional() @IsString() unitNo?: string;

  // NEW: not interested
  @IsOptional() @IsString() reason?: string;

  // NEW: admin-only financials (service ignores unless caller is ADMIN)
  @IsOptional() @Type(() => Number) @IsNumber() leadActualSlab?: number;
  @IsOptional() @Type(() => Number) @IsNumber() discount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() actualRevenue?: number;
  @IsOptional() @Type(() => Number) @IsNumber() incentiveSlab?: number;
  @IsOptional() @Type(() => Number) @IsNumber() sellRevenue?: number;
}

// NEW: UpdateQueryDto — all same fields but all optional, used for PATCH
export class UpdateQueryDto {
  @IsOptional() @IsEnum(LeadStatus)      status?: LeadStatus;
  @IsOptional() @IsString()              remark?: string;

  @IsOptional() @IsDateString()          followUpDate?: string;
  @IsOptional() @IsDateString()          visitDate?: string;
  @IsOptional() @IsDateString()          meetingDate?: string;
  @IsOptional() @IsDateString()          dealDoneDate?: string;
  @IsOptional() @IsDateString()          expVisitDate?: string;
  @IsOptional() @IsDateString()          shiftingDate?: string;

  @IsOptional() @IsEnum(LeadType)        leadType?: LeadType;
  @IsOptional() @IsString()              bhk?: string;
  @IsOptional() @IsString()              floor?: string;
  @IsOptional() @IsString()              location?: string;
  @IsOptional() @IsString()             purpose?: string;
  @IsOptional() @IsEnum(FurnishingType)  furnishingType?: FurnishingType;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() size?: number;

  @IsOptional() @IsString()             projectId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() budgetMin?: number;
  @IsOptional() @Type(() => Number) @IsNumber() budgetMax?: number;
  @IsOptional() @IsString()             budgetUnit?: string;

  @IsOptional() @IsString()  visitDoneById?: string;
  @IsOptional() @IsString()  meetingDoneById?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() closingAmount?: number;
  @IsOptional() @IsString()  unitNo?: string;
  @IsOptional() @IsString()  reason?: string;

  @IsOptional() @Type(() => Number) @IsNumber() leadActualSlab?: number;
  @IsOptional() @Type(() => Number) @IsNumber() discount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() actualRevenue?: number;
  @IsOptional() @Type(() => Number) @IsNumber() incentiveSlab?: number;
  @IsOptional() @Type(() => Number) @IsNumber() sellRevenue?: number;
}

// NEW: for POST /leads/:id/queries/:queryId/remarks
export class CreateRemarkDto {
  @IsString() text: string;
}

// ── Unchanged ──────────────────────────────────────────────────────────────────

export class LeadFilterDto {
  @IsOptional() page?: number;
  @IsOptional() limit?: number;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsEnum(LeadType)   type?: LeadType;
  @IsOptional() @IsString()         assignedToId?: string;
  @IsOptional() @IsString()         search?: string;
  @IsOptional()                     dateFrom?: string;
  @IsOptional()                     dateTo?: string;
  @IsOptional() @IsBoolean()        overdueOnly?: boolean;
}