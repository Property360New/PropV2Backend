import { Test, TestingModule } from '@nestjs/testing';
import { BulkImportController } from './bulk-import.controller';
import { BulkImportService } from './bulk-import.service';

describe('BulkImportController', () => {
  let controller: BulkImportController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BulkImportController],
      providers: [BulkImportService],
    }).compile();

    controller = module.get<BulkImportController>(BulkImportController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
