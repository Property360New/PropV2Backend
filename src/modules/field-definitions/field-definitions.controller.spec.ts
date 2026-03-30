import { Test, TestingModule } from '@nestjs/testing';
import { FieldDefinitionsController } from './field-definitions.controller';
import { FieldDefinitionsService } from './field-definitions.service';

describe('FieldDefinitionsController', () => {
  let controller: FieldDefinitionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FieldDefinitionsController],
      providers: [FieldDefinitionsService],
    }).compile();

    controller = module.get<FieldDefinitionsController>(FieldDefinitionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
