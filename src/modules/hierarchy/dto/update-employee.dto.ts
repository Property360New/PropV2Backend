// ============================================================
// src/modules/hierarchy/dto/update-employee.dto.ts
// ============================================================

import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsInt,
  IsDecimal,
  IsDateString,
  MinLength,
} from 'class-validator';
import { Designation } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

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
}