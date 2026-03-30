import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import {
  InventoryService,
  CreateInventoryDto,
  UpdateInventoryDto,
  ListInventoryDto,
} from './inventory.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

class ToggleStatusDto {
  @IsBoolean()
  isActive: boolean;
}

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Post()
  @ApiOperation({ summary: 'Add inventory item' })
  create(@CurrentUser() user: any, @Body() dto: CreateInventoryDto) {
    return this.inventoryService.createInventory(
      user.companyId,
      user.employeeId,
      dto,
      user.designation,
      user.permissions.canEditInventory,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List inventory (paginated, filtered)' })
  getAll(
    @CurrentUser('companyId') companyId: string,
    @Query() query: ListInventoryDto,
  ) {
    return this.inventoryService.getInventory(companyId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get inventory item by ID' })
  getById(
    @CurrentUser('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.inventoryService.getInventoryById(companyId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update inventory item' })
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryDto,
  ) {
    return this.inventoryService.updateInventory(
      user.companyId,
      id,
      user.employeeId,
      dto,
      user.designation,
      user.permissions.canEditInventory,
    );
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Toggle inventory active/inactive status' })
  toggleStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ToggleStatusDto,
  ) {
    return this.inventoryService.toggleInventoryStatus(
      user.companyId,
      id,
      user.employeeId,
      dto.isActive,
      user.designation,
      user.permissions.canEditInventory,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete inventory item' })
  delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.inventoryService.deleteInventory(
      user.companyId,
      id,
      user.designation,
      user.permissions.canEditInventory,
    );
  }
}