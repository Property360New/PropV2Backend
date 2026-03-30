// ============================================================
// src/modules/auth/dto/login.dto.ts
// ============================================================
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
 
export class LoginDto {
  @ApiProperty({ example: 'admin@property360.com' })
  @IsEmail()
  email: string;
 
  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(6)
  password: string;
}