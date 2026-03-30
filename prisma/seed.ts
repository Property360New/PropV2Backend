// prisma/seed.ts
// Run: npx ts-node prisma/seed.ts
// OR: npx prisma db seed (configure in package.json)

import 'dotenv/config';
import { PrismaClient, Designation, FieldType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

// ── Prisma 7 requires the adapter even in scripts ──
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding Property 360 CRM...');

  // ── 1. Create Company ──────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { slug: 'property360' },
    update: {},
    create: {
      name: 'Property 360 Degree',
      slug: 'property360',
      themeColor: '#004aad',
      isActive: true,
    },
  });
  console.log('✅ Company created:', company.id);

  // ── 2. Create Admin User + Employee ────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@property360.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@12345';

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  
  let adminEmployee: any;
  if (!existingAdmin) {
    const hash = await bcrypt.hash(adminPassword, 12);
    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hash,
        isActive: true,
        emailVerified: true,
        globalRole: 'ADMIN',
        employee: {
          create: {
            companyId: company.id,
            firstName: 'Admin',
            lastName: 'User',
            designation: Designation.ADMIN,
            isActive: true,
            status: 'ACTIVE',
            canViewAllFreshLeads: true,
            canEditInventory: true,
            canAddExpenses: true,
            canManageEmployees: true,
            canViewAllAttendance: true,
          },
        },
      },
      include: { employee: true },
    });
    adminEmployee = adminUser.employee;
    console.log('✅ Admin created:', adminEmail, '/ password:', adminPassword);
  } else {
    adminEmployee = await prisma.employee.findFirst({
      where: { userId: existingAdmin.id },
    });
    console.log('ℹ️  Admin already exists:', adminEmail);
  }

  // ── 3. Core Field Definitions for Lead ─────────────────────
  // These are the CORE fields every lead has.
  // Additional custom fields can be added via FieldDefinition API.
  const coreLeadFields = [
    { fieldKey: 'name', displayName: 'Full Name', fieldType: FieldType.TEXT, isRequired: true, displayOrder: 1, isCoreField: true },
    { fieldKey: 'phone', displayName: 'Phone', fieldType: FieldType.PHONE, isRequired: true, displayOrder: 2, isCoreField: true },
    { fieldKey: 'email', displayName: 'Email', fieldType: FieldType.EMAIL, displayOrder: 3, isCoreField: true },
    { fieldKey: 'phone2', displayName: 'Alternate Phone', fieldType: FieldType.PHONE, displayOrder: 4, isCoreField: true },
    { fieldKey: 'address', displayName: 'Address', fieldType: FieldType.LONG_TEXT, displayOrder: 5, isCoreField: true },
    { fieldKey: 'source', displayName: 'Source', fieldType: FieldType.TEXT, displayOrder: 6, isCoreField: true},
    { fieldKey: 'type', displayName: 'Lead Type', fieldType: FieldType.DROPDOWN, displayOrder: 7, isCoreField: true, options: [
      { label: 'Residential', value: 'RESIDENTIAL' },
      { label: 'Commercial', value: 'COMMERCIAL' },
      { label: 'Rent', value: 'RENT' },
    ]},
    { fieldKey: 'budget', displayName: 'Budget', fieldType: FieldType.NUMBER, displayOrder: 8, isCoreField: true },
    { fieldKey: 'project', displayName: 'Project Interest', fieldType: FieldType.DROPDOWN, displayOrder: 9, isCoreField: true },
    { fieldKey: 'requirement_area', displayName: 'Requirement Area (sqft)', fieldType: FieldType.NUMBER, displayOrder: 10 },
    { fieldKey: 'requirement_bhk', displayName: 'BHK Requirement', fieldType: FieldType.DROPDOWN, displayOrder: 11, options: [
      { label: '2 BHK', value: '2BHK' },
      { label: '3 BHK', value: '3BHK' },
      { label: '4 BHK', value: '4BHK' },
    ]},
  ];

  for (const field of coreLeadFields) {
    await prisma.fieldDefinition.upsert({
      where: {
        companyId_entityType_fieldKey: {
          companyId: company.id,
          entityType: 'lead',
          fieldKey: field.fieldKey,
        },
      },
      update: {},
      create: {
        companyId: company.id,
        entityType: 'lead',
        ...field,
        options: field.options ? field.options : undefined,
      },
    });
  }
  console.log('✅ Lead field definitions created');

  // ── 4. Core Query Field Definitions ─────────────────────────
  const coreQueryFields = [
    { fieldKey: 'call_status', displayName: 'Call Status', fieldType: FieldType.DROPDOWN, isRequired: true, displayOrder: 1, isCoreField: true },
    { fieldKey: 'remark', displayName: 'Remark', fieldType: FieldType.LONG_TEXT, displayOrder: 2, isCoreField: true },
    { fieldKey: 'follow_up_date', displayName: 'Follow-up Date', fieldType: FieldType.DATE, displayOrder: 3, isCoreField: true },
    { fieldKey: 'budget_min', displayName: 'Budget Min', fieldType: FieldType.NUMBER, displayOrder: 4, isCoreField: true },
    { fieldKey: 'budget_max', displayName: 'Budget Max', fieldType: FieldType.NUMBER, displayOrder: 5, isCoreField: true },
    { fieldKey: 'budget_unit', displayName: 'Budget Unit', fieldType: FieldType.DROPDOWN, displayOrder: 6, isCoreField: true, options: [
      { label: 'Thousands', value: 'thousands' },
      { label: 'Lakhs', value: 'lakhs' },
      { label: 'Crore', value: 'crore' },
    ]},
  ];

  for (const field of coreQueryFields) {
    await prisma.fieldDefinition.upsert({
      where: {
        companyId_entityType_fieldKey: {
          companyId: company.id,
          entityType: 'query',
          fieldKey: field.fieldKey,
        },
      },
      update: {},
      create: {
        companyId: company.id,
        entityType: 'query',
        ...field,
        options: field.options ? field.options : undefined,
      },
    });
  }
  console.log('✅ Query field definitions created');

  // ── 5. Default Terms & Conditions ──────────────────────────
  await prisma.termsConditions.upsert({
    where: { id: 'default-terms' },
    update: {},
    create: {
      id: 'default-terms',
      companyId: company.id,
      content: `Welcome to Property 360 CRM. By using this system, you agree to maintain confidentiality of all lead and customer data. All data accessed through this platform is proprietary to Property 360 Degree. Unauthorized sharing or export of data is prohibited.`,
      version: 1,
      isActive: true,
      createdById: adminEmployee?.id,
    },
  });
  console.log('✅ Default terms created');

  console.log('\n🎉 Seed complete!');
  console.log(`   Company ID: ${company.id}`);
  console.log(`   Admin email: ${adminEmail}`);
  console.log(`   Admin password: ${adminPassword}`);
  console.log(`\n   👉 Copy Company ID to .env as DEFAULT_COMPANY_ID=${company.id}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });