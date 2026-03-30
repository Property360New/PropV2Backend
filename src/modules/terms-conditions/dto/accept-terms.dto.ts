import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AcceptTermsDto {
  @ApiPropertyOptional({ description: 'TermsConditions id. If omitted, latest active is used.' })
  @IsOptional()
  @IsString()
  termsId?: string;
}

