import { Test, TestingModule } from '@nestjs/testing';
import { BulkImportService } from './bulk-import.service';

describe('BulkImportService', () => {
  let service: BulkImportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BulkImportService],
    }).compile();

    service = module.get<BulkImportService>(BulkImportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
