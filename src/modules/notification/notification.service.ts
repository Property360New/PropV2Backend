import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType, Designation } from '@prisma/client';

export class CreateNotificationDto {
  type: NotificationType;
  title: string;
  message: string;
  recipientIds: string[];   // employeeIds
  metadata?: Record<string, any>;
  expiresAt?: Date;
}

export class ListNotificationsDto {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  // ── Scope helper (same pattern as leads/reports) ────────────
  private getScopeIds(
    employeeId: string,
    designation: Designation,
    subordinateIds: string[],
  ): string[] | null {
    // Admin sees all → null means "no filter"
    if (designation === Designation.ADMIN) return null;
    // Everyone else sees own + subordinates
    return [employeeId, ...(subordinateIds ?? [])];
  }

  // ── Create and fan-out to recipients ─────────────────────
  async createNotification(
    companyId: string,
    createdById: string | null,
    dto: CreateNotificationDto,
  ) {
    return this.prisma.notification.create({
      data: {
        companyId,
        createdById,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        metadata: dto.metadata,
        expiresAt: dto.expiresAt,
        recipients: {
          create: dto.recipientIds.map((employeeId) => ({ employeeId })),
        },
      },
      include: { recipients: true },
    });
  }

  // ── Get notifications (hierarchy-aware) ─────────────────────
  // Managers see own + subordinate notifications; admins see all.
  async getMyNotifications(
  employeeId: string,
  designation: Designation,
  subordinateIds: string[],
  dto: ListNotificationsDto,
) {
  const page = Math.max(1, dto.page ?? 1);
  const limit = Math.min(100, dto.limit ?? 20);
  const skip = (page - 1) * limit;

  const scopeIds = this.getScopeIds(employeeId, designation, subordinateIds);

  // For BIRTHDAY/ANNIVERSARY: only return the recipient record belonging
  // to the requesting employee themselves (not all 4 company employees).
  // For other types: use scope-based visibility as before.
  const where: any = {
    notification: {
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    },
    ...(dto.unreadOnly ? { readAt: null } : {}),
  };

  // Birthday/anniversary are personal — each employee should only see
  // their OWN recipient record, not every colleague's copy.
  // All other notifications use scope-based visibility.
  if (scopeIds) {
    where.employeeId = { in: scopeIds };
  }

  const [total, data] = await Promise.all([
    this.prisma.notificationRecipient.count({ where }),
    this.prisma.notificationRecipient.findMany({
      where,
      skip,
      take: limit,
      orderBy: { notification: { createdAt: 'desc' } },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, designation: true },
        },
        notification: {
          select: {
            id: true,
            type: true,
            title: true,
            message: true,
            metadata: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  // ── DEDUP: For BIRTHDAY/ANNIVERSARY, multiple recipient rows exist
  // (one per company employee). We only want ONE entry per notification
  // in the response — keep the row belonging to the requesting employee,
  // or if not found, just the first occurrence.
  const seen = new Map<string, typeof data[number]>();
  for (const r of data) {
    const notifId = r.notification.id;
    const type = r.notification.type;
    if (type === 'BIRTHDAY' || type === 'ANNIVERSARY') {
      // Prefer the row where this employee is the recipient
      if (!seen.has(notifId) || r.employeeId === employeeId) {
        seen.set(notifId, r);
      }
    } else {
      // For other types, keep all (they're distinct notifications)
      seen.set(`${notifId}-${r.id}`, r);
    }
  }

  const deduped = Array.from(seen.values());

  const notifications = deduped.map((r) => ({
    id: r.notification.id,
    recipientId: r.id,
    readAt: r.readAt,
    recipientEmployee: r.employee,
    isOwnNotification: r.employeeId === employeeId,
    type: r.notification.type,
    title: r.notification.title,
    message: r.notification.message,
    metadata: r.notification.metadata,
    createdAt: r.notification.createdAt,
  }));

  return {
    data: notifications,
    meta: {
      total: notifications.length,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

  // ── Unread count (hierarchy-aware, for badge) ───────────────
  // Shows total unread across own + subordinate notifications.
  async getUnreadCount(
    employeeId: string,
    designation: Designation,
    subordinateIds: string[],
  ): Promise<{ count: number }> {
    const scopeIds = this.getScopeIds(employeeId, designation, subordinateIds);

    const count = await this.prisma.notificationRecipient.count({
      where: {
        ...(scopeIds ? { employeeId: { in: scopeIds } } : {}),
        readAt: null,
        notification: {
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
      },
    });
    return { count };
  }

  // ── Mark single as read ───────────────────────────────────
  // Only marks the requesting user's own recipient record as read.
  // Subordinate notifications are view-only for managers.
  async markAsRead(
    employeeId: string,
    designation: Designation,
    subordinateIds: string[],
    notificationId: string,
  ) {
    await this.prisma.notificationRecipient.updateMany({
      where: {
        notificationId,
        employeeId, // Only mark own record, not subordinates'
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  // ── Mark all as read ──────────────────────────────────────
  // Marks only the requesting user's own unread notifications as read.
  async markAllAsRead(
    employeeId: string,
    designation: Designation,
    subordinateIds: string[],
  ) {
    const { count } = await this.prisma.notificationRecipient.updateMany({
      where: {
        employeeId, // Only mark own records, not subordinates'
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { marked: count };
  }

  // ── System helpers — called by other services/crons ───────

  async notifyEmployee(
    companyId: string,
    employeeId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, any>,
  ) {
    return this.createNotification(companyId, null, {
      type,
      title,
      message,
      recipientIds: [employeeId],
      metadata,
    });
  }

  async notifyTeam(
    companyId: string,
    employeeIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, any>,
  ) {
    if (!employeeIds.length) return null;
    return this.createNotification(companyId, null, {
      type,
      title,
      message,
      recipientIds: employeeIds,
      metadata,
    });
  }

  // ── Birthday & anniversary notifications (called by cron) ─
  async sendSpecialDayNotifications(companyId: string) {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const employees = await this.prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthday: true,
        marriageAnniversary: true,
      },
    });

    // Get all employee IDs to notify (notify everyone in the company)
    const allIds = employees.map((e) => e.id);

    for (const emp of employees) {
      const fullName = `${emp.firstName} ${emp.lastName ?? ''}`.trim();

      // Birthday
      if (
        emp.birthday &&
        new Date(emp.birthday).getMonth() + 1 === month &&
        new Date(emp.birthday).getDate() === day
      ) {
        await this.notifyTeam(
          companyId,
          allIds,
          NotificationType.BIRTHDAY,
          `🎂 Happy Birthday, ${fullName}!`,
          `Today is ${fullName}'s birthday. Wish them well!`,
          { employeeId: emp.id },
        );
      }

      // Marriage anniversary
      if (
        emp.marriageAnniversary &&
        new Date(emp.marriageAnniversary).getMonth() + 1 === month &&
        new Date(emp.marriageAnniversary).getDate() === day
      ) {
        await this.notifyTeam(
          companyId,
          allIds,
          NotificationType.ANNIVERSARY,
          `💍 Happy Anniversary, ${fullName}!`,
          `Today is ${fullName}'s wedding anniversary. Congratulate them!`,
          { employeeId: emp.id },
        );
      }
    }
  }

  // ── Admin: send manual notification ──────────────────────
  async sendManualNotification(
    companyId: string,
    senderId: string,
    dto: CreateNotificationDto,
    designation: Designation,
  ) {
    if (designation !== Designation.ADMIN) {
      throw new Error('Only admin can send manual notifications');
    }
    return this.createNotification(companyId, senderId, dto);
  }
}
