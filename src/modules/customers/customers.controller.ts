import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { CustomersService, UpdateDealDetailsDto, ListCustomersDto } from './customers.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private customersService: CustomersService) { }

  @Get()
  @ApiOperation({ summary: 'List customers (scoped by hierarchy)' })
  getAll(@CurrentUser() user: any, @Query() query: ListCustomersDto) {
    return this.customersService.getCustomers(
      user.companyId,
      user,   // ← pass whole user object, service destructures { employeeId, designation, subordinateIds }
      query,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID with full lead history' })
  getById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.customersService.getCustomerById(user.companyId, id);
    //          ↑ companyId from user object, not @CurrentUser('companyId') decorator
  }

  @Patch(':id/deal-details/:queryId')
  @ApiOperation({ summary: 'Admin: update deal details for a specific deal query' })
  updateDealDetails(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('queryId') queryId: string,
    @Body() dto: UpdateDealDetailsDto,
  ) {
    return this.customersService.updateDealDetails(
      user.companyId, id, queryId, dto, user.designation,
    );
  }
}