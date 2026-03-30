import { PartialType } from '@nestjs/mapped-types';
import { CreateBulkImportDto } from './create-bulk-import.dto';

export class UpdateBulkImportDto extends PartialType(CreateBulkImportDto) {}
