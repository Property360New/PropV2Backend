import { Module } from '@nestjs/common';
import { TermsConditionsController } from './terms-conditions.controller';
import { TermsConditionsService } from './terms-conditions.service';

@Module({
  controllers: [TermsConditionsController],
  providers: [TermsConditionsService],
})
export class TermsConditionsModule {}

