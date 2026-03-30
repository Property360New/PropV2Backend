import { PartialType } from '@nestjs/mapped-types';
import { CreateFieldDefinitionDto } from './create-field-definition.dto';

export class UpdateFieldDefinitionDto extends PartialType(CreateFieldDefinitionDto) {}
