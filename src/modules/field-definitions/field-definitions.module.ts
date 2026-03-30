import { Module } from '@nestjs/common';
import { FieldDefinitionsController } from './field-definitions.controller';
import { FieldDefinitionsService } from './field-definitions.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FieldDefinitionsController],
  providers: [FieldDefinitionsService],
  exports: [FieldDefinitionsService],
})
export class FieldDefinitionsModule {}