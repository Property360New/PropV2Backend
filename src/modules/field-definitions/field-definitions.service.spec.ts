import { Test, TestingModule } from '@nestjs/testing';
import { FieldDefinitionsService } from './field-definitions.service';

describe('FieldDefinitionsService', () => {
  let service: FieldDefinitionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FieldDefinitionsService],
    }).compile();

    service = module.get<FieldDefinitionsService>(FieldDefinitionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
