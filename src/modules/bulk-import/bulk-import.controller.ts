import {
  Controller,
  Get,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';   // 'import type' fixes isolatedModules error
import { BulkImportService } from './bulk-import.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';

@ApiTags('bulk-import')
@ApiBearerAuth()
@Controller('bulk-import')
export class BulkImportController {
  constructor(private bulkImportService: BulkImportService) {}

  @Get('template')
  @ApiOperation({ summary: 'Download Excel import template (.xlsx)' })
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.bulkImportService.getImportTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="leads-import-template.xlsx"',
    );
    res.end(buffer);  // use res.end() not res.send() — avoids NestJS interceptor double-send
  }

  @Get('history')
  @ApiOperation({ summary: 'Get bulk import history for this company' })
  getHistory(@CurrentUser() user: any) {
    return this.bulkImportService.getImportHistory(user.companyId);
  }

  @Post('leads')
  @ApiOperation({ summary: 'Upload .xlsx file to bulk import leads' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_, file, cb) => {
        const allowed = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Only .xlsx and .xls files are allowed'), false);
        }
      },
    }),
  )
  async importLeads(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('assignedToId') assignedToId?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    return this.bulkImportService.importLeads(
      user.companyId,
      user.employeeId,
      file.buffer,
      file.originalname,
      assignedToId,
    );
  }
}