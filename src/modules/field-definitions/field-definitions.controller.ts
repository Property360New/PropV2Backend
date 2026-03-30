import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  FieldDefinitionsService,
  CreateFieldDefinitionDto,
  UpdateFieldDefinitionDto,
  ReorderFieldsDto,
} from './field-definitions.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('field-definitions')
@ApiBearerAuth()
@Controller('field-definitions')
export class FieldDefinitionsController {
  constructor(private fieldDefinitionsService: FieldDefinitionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a custom field (Admin only)' })
  create(@CurrentUser() user: any, @Body() dto: CreateFieldDefinitionDto) {
    return this.fieldDefinitionsService.createField(user.companyId, dto, user.designation);
  }

  @Get()
  @ApiOperation({
    summary: 'Get field definitions. Pass ?entityType=query&leadType=RENT to get query fields for a specific lead type',
  })
  getAll(
    @CurrentUser() user: any,
    @Query('entityType') entityType?: string,
    @Query('leadType') leadType?: string,
  ) {
    return this.fieldDefinitionsService.getAllFields(
      user.companyId,
      entityType,
      user.designation,
      leadType,
    );
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reorder fields (Admin only)' })
  reorder(@CurrentUser() user: any, @Body() dto: ReorderFieldsDto) {
    return this.fieldDefinitionsService.reorderFields(user.companyId, dto, user.designation);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update field definition (Admin only)' })
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateFieldDefinitionDto,
  ) {
    return this.fieldDefinitionsService.updateField(user.companyId, id, dto, user.designation);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete custom field (Admin only, non-core only)' })
  delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.fieldDefinitionsService.deleteField(user.companyId, id, user.designation);
  }
}