import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CaptureStaffLocationDto } from './dto/capture-staff-location.dto';
import { StaffLocationService } from './staff-location.service';
import { IsString, IsEnum, IsOptional, IsNumber } from 'class-validator';

export class RequestStaffLocationDto {
  @IsString()
  employeeId: string;
}

export class RespondStaffLocationRequestDto {
  @IsString()
  notificationId: string;

  @IsEnum(['ACCEPT', 'DENY'])
  action: 'ACCEPT' | 'DENY';

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;
}

@ApiTags('staff-location')
@ApiBearerAuth()
@Controller('staff-location')
export class StaffLocationController {
  constructor(private service: StaffLocationService) {}

  @Post('capture')
  @ApiOperation({ summary: 'Capture current user location (geolocation)' })
  capture(@CurrentUser() user: any, @Body() dto: CaptureStaffLocationDto) {
    return this.service.capture(user.companyId, user.employeeId, dto);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get latest known location per employee (scoped by hierarchy)' })
  getLatest(@CurrentUser() user: any) {
    return this.service.getLatest(user.companyId, user.employeeId, user.designation, user.subordinateIds);
  }

  @Post('request')
  @ApiOperation({ summary: 'Admin: request staff location (creates a notification)' })
  requestLocation(@CurrentUser() user: any, @Body() dto: RequestStaffLocationDto) {
    return this.service.requestLocation(user.companyId, user.employeeId, user.designation, dto.employeeId);
  }

  @Get('requests/mine')
  @ApiOperation({ summary: 'Get my pending staff location requests' })
  getMyRequests(@CurrentUser('employeeId') employeeId: string) {
    return this.service.getMyPendingRequests(employeeId);
  }

  @Post('respond')
  @ApiOperation({ summary: 'Respond to a staff location request (accept/deny)' })
  respond(@CurrentUser() user: any, @Body() dto: RespondStaffLocationRequestDto) {
    return this.service.respondToRequest(user.companyId, user.employeeId, dto);
  }
}
