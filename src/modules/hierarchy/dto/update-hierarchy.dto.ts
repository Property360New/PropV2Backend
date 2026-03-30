import { PartialType } from '@nestjs/mapped-types';
import { CreateHierarchyDto } from './create-hierarchy.dto';

export class UpdateHierarchyDto extends PartialType(CreateHierarchyDto) {}
