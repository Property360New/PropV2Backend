import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsDateString,
  Matches,
  Length,
} from 'class-validator';
import { Designation } from '@prisma/client';
import { EmployeeType } from './create-employee.dto';

export class UpdateEmployeeDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(Designation) designation?: string;
  @IsOptional() @IsString() reportingManagerId?: string | null;
  @IsOptional() @IsDateString() birthday?: string;
  @IsOptional() @IsDateString() marriageAnniversary?: string;
  @IsOptional() @IsInt() dailyCallTarget?: number;
  @IsOptional() monthlySalesTarget?: number;

  // ── New fields ──────────────────────────────────────────
  @IsOptional()
  @IsString()
  @Length(12, 12, { message: 'Aadhaar number must be exactly 12 digits' })
  @Matches(/^\d{12}$/, { message: 'Aadhaar number must contain only digits' })
  aadhaarNumber?: string;

  @IsOptional()
  @IsString()
  @Length(10, 10, { message: 'PAN must be exactly 10 characters' })
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, { message: 'Invalid PAN format (e.g. ABCDE1234F)' })
  panNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'Emergency contact must be a 10-digit number' })
  emergencyContact?: string;

  @IsOptional()
  @IsEnum(EmployeeType)
  employeeType?: EmployeeType;
}