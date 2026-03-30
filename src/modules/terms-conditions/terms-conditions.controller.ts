import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AcceptTermsDto } from './dto/accept-terms.dto';
import { CreateTermsDto } from './dto/create-terms.dto';
import { TermsConditionsService } from './terms-conditions.service';

@ApiTags('terms-conditions')
@ApiBearerAuth()
@Controller('terms-conditions')
export class TermsConditionsController {
  constructor(private service: TermsConditionsService) {}

  @Get('latest')
  @ApiOperation({ summary: 'Get latest active terms (company)' })
  @Public()
  getLatest(@CurrentUser() user: any, @Query('companyId') companyId?: string) {
    return this.service.getLatest(user?.companyId ?? companyId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get all terms versions (admin)' })
  getHistory(@CurrentUser() user: any) {
    return this.service.getHistory(user.companyId);
  }

  @Get('needs-acceptance')
  @ApiOperation({ summary: 'Check if current user must accept latest terms' })
  needsAcceptance(@CurrentUser() user: any) {
    return this.service.needsAcceptance(user.companyId, user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Publish new terms version (admin)' })
  create(@CurrentUser() user: any, @Body() dto: CreateTermsDto) {
    return this.service.createNewVersion(user.companyId, user.sub, user.designation, dto);
  }

  @Post('accept')
  @ApiOperation({ summary: 'Accept latest terms (current user)' })
  accept(@CurrentUser() user: any, @Body() dto: AcceptTermsDto, @Req() req: any) {
    return this.service.accept(user.companyId, user.sub, dto, {
      ip: req.ip,
      ua: req.headers['user-agent'],
    });
  }
}
