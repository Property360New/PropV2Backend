import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpsertPrivacyPolicyDto {
  @ApiProperty({ description: 'Markdown or plain text privacy policy content' })
  @IsString()
  content: string;
}

