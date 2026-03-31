import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsInt,
  IsDateString,
  MinLength,
  Matches,
  Length,
} from 'class-validator';
import { Designation } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export enum EmployeeType {
  EMPLOYEE = 'EMPLOYEE',
  PNL = 'PNL',
  CHANNEL_PARTNER = 'CHANNEL_PARTNER',
}

export class CreateEmployeeDto {
  @ApiProperty({ example: 'john@property360.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: Designation })
  @IsEnum(Designation)
  designation: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reportingManagerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  birthday?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  marriageAnniversary?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  dailyCallTarget?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  monthlySalesTarget?: number;

  // ── New fields ──────────────────────────────────────────
  @ApiProperty({ required: false, description: '12-digit Aadhaar number' })
  @IsOptional()
  @IsString()
  @Length(12, 12, { message: 'Aadhaar number must be exactly 12 digits' })
  @Matches(/^\d{12}$/, { message: 'Aadhaar number must contain only digits' })
  aadhaarNumber?: string;

  @ApiProperty({ required: false, description: '10-character PAN number' })
  @IsOptional()
  @IsString()
  @Length(10, 10, { message: 'PAN must be exactly 10 characters' })
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, { message: 'Invalid PAN format (e.g. ABCDE1234F)' })
  panNumber?: string;

  @ApiProperty({ required: false, description: '10-digit emergency contact number' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'Emergency contact must be a 10-digit number' })
  emergencyContact?: string;

  @ApiProperty({ required: false, enum: EmployeeType, default: EmployeeType.EMPLOYEE })
  @IsOptional()
  @IsEnum(EmployeeType)
  employeeType?: EmployeeType;
}