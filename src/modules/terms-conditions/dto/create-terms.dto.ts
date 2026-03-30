import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateTermsDto {
  @ApiProperty({ description: 'Markdown or plain text terms content' })
  @IsString()
  content: string;
}

