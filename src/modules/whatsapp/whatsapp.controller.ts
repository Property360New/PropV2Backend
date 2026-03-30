import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import {
  WhatsappService,
  UpsertTemplateDto,
  RenderTemplateDto,
} from './whatsapp.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('whatsapp')
@ApiBearerAuth()
@Controller('whatsapp')
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  @Get('placeholders')
  @ApiOperation({ summary: 'Get supported {placeholder} tokens for the template editor' })
  getPlaceholders() {
    return this.whatsappService.getPlaceholderReference();
  }

  @Get('template')
  @ApiOperation({ summary: 'Get my WhatsApp template' })
  getMyTemplate(@CurrentUser('employeeId') employeeId: string) {
    return this.whatsappService.getMyTemplate(employeeId);
  }

  @Put('template')
  @ApiOperation({ summary: 'Create or update my WhatsApp template' })
  upsertTemplate(@CurrentUser() user: any, @Body() dto: UpsertTemplateDto) {
    return this.whatsappService.upsertMyTemplate(user.companyId, user.employeeId, dto);
  }

  @Delete('template')
  @ApiOperation({ summary: 'Delete my WhatsApp template' })
  deleteTemplate(@CurrentUser('employeeId') employeeId: string) {
    return this.whatsappService.deleteMyTemplate(employeeId);
  }

  @Post('render')
  @ApiOperation({ summary: 'Render template with lead data → returns message + wa.me URL' })
  render(@CurrentUser() user: any, @Body() dto: RenderTemplateDto) {
    return this.whatsappService.renderTemplate(user.companyId, user.employeeId, dto);
  }

  @Get('admin/all')
  @ApiOperation({ summary: 'Admin: list all employee templates in company' })
  getAllTemplates(@CurrentUser() user: any) {
    return this.whatsappService.getAllTemplates(user.companyId, user.designation);
  }
}