// ============================================================
// src/modules/hierarchy/dto/create-employee.dto.ts
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
}
 
