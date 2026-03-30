import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UpsertPrivacyPolicyDto } from './dto/upsert-privacy-policy.dto';
import { PrivacyPolicyService } from './privacy-policy.service';

@ApiTags('privacy-policy')
@ApiBearerAuth()
@Controller('privacy-policy')
export class PrivacyPolicyController {
  constructor(private service: PrivacyPolicyService) {}

  @Get('latest')
  @ApiOperation({ summary: 'Get latest privacy policy (company)' })
  @Public()
  getLatest(@CurrentUser() user: any, @Query('companyId') companyId?: string) {
    return this.service.getLatest(user?.companyId ?? companyId);
  }

  @Post()
  @ApiOperation({ summary: 'Publish privacy policy (admin)' })
  upsert(@CurrentUser() user: any, @Body() dto: UpsertPrivacyPolicyDto) {
    return this.service.upsert(user.companyId, user.designation, dto);
  }
}
