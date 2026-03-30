import { PrismaService } from '../../prisma/prisma.service';

// Use this in any findMany where you want to exclude soft-deleted records
export function withActive(where: Record<string, any> = {}): Record<string, any> {
  if (where.isActive === undefined) {
    return { ...where, isActive: true };
  }
  return where;
}

// Use this instead of prisma.lead.delete()
export async function softDelete(
  prisma: PrismaService,
  model: 'lead' | 'inventory' | 'project',
  id: string,
) {
  // @ts-ignore — dynamic model access is safe here
  return prisma[model].update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });
}