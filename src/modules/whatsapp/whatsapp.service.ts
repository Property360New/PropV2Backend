import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Designation } from '@prisma/client';

// WhatsappTemplate schema: id, companyId, employeeId, templateText, createdAt, updatedAt
// @@unique([employeeId]) — one template per employee

const SUPPORTED_PLACEHOLDERS: Record<string, string> = {
  '{lead_name}':        "Lead's full name",
  '{lead_phone}':       "Lead's phone number",
  '{lead_email}':       "Lead's email address",
  '{lead_project}':     'Assigned project name',
  '{lead_budget}':      'Budget range',
  '{followup_date}':    'Next follow-up date',
  '{user_name}':        'Your (employee) full name',
  '{user_designation}': 'Your designation',
};

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export class UpsertTemplateDto {
  // FIX: was missing @IsString() / @IsNotEmpty() — ValidationPipe with
  // whitelist:true was stripping the field and returning 400
  @IsString()
  @IsNotEmpty()
  templateText: string;
}

export class RenderTemplateDto {
  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  templateText?: string;

  @IsOptional()
  variables?: Record<string, string>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class WhatsappService {
  constructor(private prisma: PrismaService) {}

  // ── Upsert (each employee has exactly one template) ───────────────────────
  async upsertMyTemplate(
    companyId: string,
    employeeId: string,
    dto: UpsertTemplateDto,
  ) {
    return this.prisma.whatsappTemplate.upsert({
      where:  { employeeId },
      update: { templateText: dto.templateText },
      create: { companyId, employeeId, templateText: dto.templateText },
    });
  }

  // ── Get my template ───────────────────────────────────────────────────────
  async getMyTemplate(employeeId: string) {
    const t = await this.prisma.whatsappTemplate.findUnique({
      where: { employeeId },
    });
    return {
      templateText:          t?.templateText ?? '',
      hasTemplate:           !!t,
      supportedPlaceholders: SUPPORTED_PLACEHOLDERS,
    };
  }

  // ── Admin: list all company templates ────────────────────────────────────
  async getAllTemplates(companyId: string, designation: Designation) {
    if (designation !== Designation.ADMIN) {
      throw new ForbiddenException('Only admin can view all templates');
    }
    return this.prisma.whatsappTemplate.findMany({
      where:   { companyId },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, designation: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // ── Delete my template ────────────────────────────────────────────────────
  async deleteMyTemplate(employeeId: string) {
    const t = await this.prisma.whatsappTemplate.findUnique({
      where: { employeeId },
    });
    if (!t) throw new NotFoundException('No template found');
    await this.prisma.whatsappTemplate.delete({ where: { employeeId } });
    return { message: 'Template deleted' };
  }

  // ── Render: replace placeholders → message + wa.me URL ───────────────────
  async renderTemplate(
    companyId: string,
    employeeId: string,
    dto: RenderTemplateDto,
  ) {
    let message = dto.templateText;
    if (!message) {
      const t = await this.prisma.whatsappTemplate.findUnique({
        where: { employeeId },
      });
      if (!t) throw new NotFoundException('You have not set a WhatsApp template yet');
      message = t.templateText;
    }

    // Employee vars
    const emp = await this.prisma.employee.findUnique({
      where:  { id: employeeId },
      select: { firstName: true, lastName: true, designation: true },
    });
    const vars: Record<string, string> = {
      user_name:        emp ? `${emp.firstName} ${emp.lastName ?? ''}`.trim() : '',
      user_designation: emp?.designation ?? '',
    };

    // Lead vars
    let leadPhone: string | null = null;
    if (dto.leadId) {
      const lead = await this.prisma.lead.findFirst({
        where:   { id: dto.leadId, companyId },
        include: {
          project: { select: { name: true } },
          queries: {
            where:   { followUpDate: { not: null } },
            orderBy: { createdAt: 'desc' },
            take:    1,
            select:  { followUpDate: true },
          },
        },
      });

      if (lead) {
        leadPhone = lead.phone;
        const budgetStr =
          lead.budgetMin && lead.budgetMax
            ? `${lead.budgetMin}–${lead.budgetMax} ${lead.budgetUnit ?? ''}`.trim()
            : lead.budgetMin
              ? `${lead.budgetMin} ${lead.budgetUnit ?? ''}`.trim()
              : '';
        const followupDate = lead.queries[0]?.followUpDate
          ? new Date(lead.queries[0].followUpDate).toLocaleDateString('en-IN')
          : '';

        Object.assign(vars, {
          lead_name:    lead.name,
          lead_phone:   lead.phone,
          lead_email:   lead.email ?? '',
          lead_project: lead.project?.name ?? '',
          lead_budget:  budgetStr,
          followup_date: followupDate,
        });
      }
    }

    // Manual overrides from caller
    if (dto.variables) Object.assign(vars, dto.variables);

    // Replace all {token} occurrences
    for (const [key, value] of Object.entries(vars)) {
      message = message.replaceAll(`{${key}}`, value);
    }

    // Build wa.me URL
    let whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    if (leadPhone) {
      const digits = leadPhone.replace(/\D/g, '');
      const phone  = digits.length === 10 ? `91${digits}` : digits;
      whatsappUrl  = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    }

    return { renderedMessage: message, whatsappUrl };
  }

  // ── Placeholder reference for UI ──────────────────────────────────────────
  getPlaceholderReference() {
    return { supportedPlaceholders: SUPPORTED_PLACEHOLDERS };
  }
}