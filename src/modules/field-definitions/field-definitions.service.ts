import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Designation, FieldType, Prisma } from '@prisma/client';

export class CreateFieldDefinitionDto {
  entityType: 'lead' | 'query' | 'customer' | 'inventory';
  fieldKey: string;
  displayName: string;
  fieldType: FieldType;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: any;
  isRequired?: boolean;
  isVisible?: boolean;
  isSearchable?: boolean;
  isFilterable?: boolean;
  displayOrder?: number;
  // Which lead types show this field (in query form) — null/[] = all types
  applicableLeadTypes?: string[];
}

export class UpdateFieldDefinitionDto {
  displayName?: string;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: any;
  isRequired?: boolean;
  isVisible?: boolean;
  isSearchable?: boolean;
  isFilterable?: boolean;
  displayOrder?: number;
  applicableLeadTypes?: string[];
}

export class ReorderFieldsDto {
  fields: Array<{ id: string; displayOrder: number }>;
}

@Injectable()
export class FieldDefinitionsService {
  constructor(private prisma: PrismaService) {}

  private assertAdmin(designation: Designation) {
    if (designation !== Designation.ADMIN) {
      throw new ForbiddenException('Only admin can manage field definitions');
    }
  }

  async createField(companyId: string, dto: CreateFieldDefinitionDto, designation: Designation) {
    this.assertAdmin(designation);

    if (!/^[a-z0-9_]+$/.test(dto.fieldKey)) {
      throw new BadRequestException(
        'fieldKey must be lowercase letters, numbers, and underscores only',
      );
    }

    const existing = await this.prisma.fieldDefinition.findUnique({
      where: {
        companyId_entityType_fieldKey: { companyId, entityType: dto.entityType, fieldKey: dto.fieldKey },
      },
    });
    if (existing) {
      throw new ConflictException(`Field key "${dto.fieldKey}" already exists for entity "${dto.entityType}"`);
    }

    return this.prisma.fieldDefinition.create({
      data: {
        companyId,
        entityType: dto.entityType,
        fieldKey: dto.fieldKey,
        displayName: dto.displayName,
        fieldType: dto.fieldType,
        placeholder: dto.placeholder,
        helpText: dto.helpText,
        options: dto.options ?? undefined,
        defaultValue: dto.defaultValue ?? undefined,
        isRequired: dto.isRequired,
        isVisible: dto.isVisible,
        isSearchable: dto.isSearchable,
        isFilterable: dto.isFilterable,
        displayOrder: dto.displayOrder,
        applicableLeadTypes: dto.applicableLeadTypes?.length
          ? dto.applicableLeadTypes
          : undefined,
      },
    });
  }

  /**
   * Get fields for a form.
   * For query entity, pass leadType to get only applicable fields.
   * e.g. GET /field-definitions?entityType=query&leadType=RENT
   * Returns fields where applicableLeadTypes is empty/null OR contains the leadType.
   */
  async getAllFields(
    companyId: string,
    entityType?: string,
    designation?: Designation,
    leadType?: string,
  ) {
    const isAdmin = designation === Designation.ADMIN;

    const all = await this.prisma.fieldDefinition.findMany({
      where: {
        companyId,
        ...(entityType ? { entityType } : {}),
        ...(!isAdmin ? { isVisible: true } : {}),
      },
      orderBy: [{ entityType: 'asc' }, { displayOrder: 'asc' }],
    });

    // If leadType provided, filter by applicableLeadTypes
    if (leadType && entityType === 'query') {
      return all.filter((f) => {
        const types = f.applicableLeadTypes as string[] | null;
        // null or empty array = applies to all types
        if (!types || types.length === 0) return true;
        return types.includes(leadType);
      });
    }

    return all;
  }

  async updateField(
    companyId: string,
    fieldId: string,
    dto: UpdateFieldDefinitionDto,
    designation: Designation,
  ) {
    this.assertAdmin(designation);

    const field = await this.prisma.fieldDefinition.findFirst({ where: { id: fieldId, companyId } });
    if (!field) throw new NotFoundException('Field definition not found');

    return this.prisma.fieldDefinition.update({
      where: { id: fieldId },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.placeholder !== undefined && { placeholder: dto.placeholder }),
        ...(dto.helpText !== undefined && { helpText: dto.helpText }),
        ...(dto.options !== undefined && { options: dto.options }),
        ...(dto.defaultValue !== undefined && { defaultValue: dto.defaultValue }),
        ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
        ...(dto.isVisible !== undefined && { isVisible: dto.isVisible }),
        ...(dto.isSearchable !== undefined && { isSearchable: dto.isSearchable }),
        ...(dto.isFilterable !== undefined && { isFilterable: dto.isFilterable }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        ...(dto.applicableLeadTypes !== undefined && {
          applicableLeadTypes: dto.applicableLeadTypes.length
            ? dto.applicableLeadTypes
            : Prisma.JsonNull,
        }),
      },
    });
  }

  async deleteField(companyId: string, fieldId: string, designation: Designation) {
    this.assertAdmin(designation);

    const field = await this.prisma.fieldDefinition.findFirst({ where: { id: fieldId, companyId } });
    if (!field) throw new NotFoundException('Field definition not found');
    if (field.isCoreField) throw new ForbiddenException('Core fields cannot be deleted');

    await this.prisma.leadFieldValue.deleteMany({ where: { fieldDefinitionId: fieldId } });
    await this.prisma.fieldDefinition.delete({ where: { id: fieldId } });
    return { message: 'Field deleted successfully' };
  }

  async reorderFields(companyId: string, dto: ReorderFieldsDto, designation: Designation) {
    this.assertAdmin(designation);

    await Promise.all(
      dto.fields.map((f) =>
        this.prisma.fieldDefinition.updateMany({
          where: { id: f.id, companyId },
          data: { displayOrder: f.displayOrder },
        }),
      ),
    );

    return { message: 'Fields reordered successfully' };
  }

  // ── Field value helpers ───────────────────────────────────

  async saveFieldValues(leadId: string, customFields: Record<string, any>, companyId: string) {
    if (!customFields || !Object.keys(customFields).length) return;

    const fieldDefs = await this.prisma.fieldDefinition.findMany({
      where: { companyId, entityType: 'lead' },
    });
    const defsByKey = Object.fromEntries(fieldDefs.map((f) => [f.fieldKey, f]));

    const upserts = Object.entries(customFields)
      .filter(([key]) => defsByKey[key])
      .map(([key, value]) => {
        const def = defsByKey[key];
        const valueData = this.buildValueData(def.fieldType, value);
        return this.prisma.leadFieldValue.upsert({
          where: { leadId_fieldDefinitionId: { leadId, fieldDefinitionId: def.id } },
          update: { ...valueData },
          create: { leadId, fieldDefinitionId: def.id, ...valueData },
        });
      });

    await Promise.all(upserts);
  }

  async getFieldValues(leadId: string): Promise<Record<string, any>> {
    const values = await this.prisma.leadFieldValue.findMany({
      where: { leadId },
      include: { fieldDefinition: true },
    });

    const result: Record<string, any> = {};
    for (const v of values) {
      result[v.fieldDefinition.fieldKey] = this.extractValue(v.fieldDefinition.fieldType, v);
    }
    return result;
  }

  private buildValueData(fieldType: FieldType, value: any) {
    const searchableValue = String(value ?? '').toLowerCase().slice(0, 255);
    switch (fieldType) {
      case FieldType.NUMBER:
      case FieldType.DECIMAL:
      case FieldType.CURRENCY:
      case FieldType.PERCENTAGE:
        return { numberValue: value != null ? Number(value) : null, searchableValue, sortableValue: String(value ?? '') };
      case FieldType.DATE:
      case FieldType.DATETIME:
        return { dateValue: value ? new Date(value) : null, searchableValue, sortableValue: value ? new Date(value).toISOString() : null };
      case FieldType.BOOLEAN:
        return { booleanValue: Boolean(value), searchableValue: String(value), sortableValue: String(value) };
      case FieldType.MULTI_SELECT:
        return { jsonValue: Array.isArray(value) ? value : [value], searchableValue: Array.isArray(value) ? value.join(' ').toLowerCase() : searchableValue, sortableValue: null };
      default:
        return { textValue: value != null ? String(value) : null, searchableValue, sortableValue: String(value ?? '').slice(0, 255) };
    }
  }

  private extractValue(fieldType: FieldType, v: any): any {
    switch (fieldType) {
      case FieldType.NUMBER: case FieldType.DECIMAL: case FieldType.CURRENCY: case FieldType.PERCENTAGE: return v.numberValue;
      case FieldType.DATE: case FieldType.DATETIME: return v.dateValue;
      case FieldType.BOOLEAN: return v.booleanValue;
      case FieldType.MULTI_SELECT: return v.jsonValue;
      default: return v.textValue;
    }
  }
}