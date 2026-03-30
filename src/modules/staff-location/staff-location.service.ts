import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CaptureStaffLocationDto } from './dto/capture-staff-location.dto';
import { Designation, NotificationType } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class StaffLocationService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  private async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Property360CRM/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data.display_name ?? null;
    } catch {
      return null;
    }
  }

  async capture(companyId: string, employeeId: string, dto: CaptureStaffLocationDto) {
    const prisma = this.prisma as any;
    const address = await this.reverseGeocode(dto.latitude, dto.longitude);

    return prisma.staffLocation.create({
      data: {
        employeeId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy ?? null,
        address,
        requestedById: dto.requestedById ?? null,
        employee: { connect: { id: employeeId } },
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, designation: true, avatar: true, companyId: true },
        },
      },
    });
  }

  async getLatest(companyId: string, employeeId: string, designation: Designation, subordinateIds: string[]) {
    const prisma = this.prisma as any;
    const scopeIds =
      designation === Designation.ADMIN ? null : [employeeId, ...(subordinateIds ?? [])];

    const records = await prisma.staffLocation.findMany({
      where: {
        employee: { companyId, ...(scopeIds ? { id: { in: scopeIds } } : {}) },
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, designation: true, avatar: true },
        },
      },
      orderBy: { capturedAt: 'desc' },
      take: scopeIds ? Math.min(scopeIds.length * 5, 500) : 500,
    });

    const latestByEmployee = new Map<string, any>();
    for (const r of records) {
      if (!latestByEmployee.has(r.employeeId)) latestByEmployee.set(r.employeeId, r);
    }

    return Array.from(latestByEmployee.values()).sort((a, b) => {
      return new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime();
    });
  }

  async requestLocation(
    companyId: string,
    requestedById: string,
    designation: Designation,
    employeeId: string,
  ) {
    if (designation !== Designation.ADMIN) {
      throw new ForbiddenException('Only admin can request staff location');
    }

    const prisma = this.prisma as any;
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const requestedBy = await prisma.employee.findFirst({
      where: { id: requestedById, companyId },
      select: { firstName: true, lastName: true },
    });
    const requestedByName = requestedBy ? `${requestedBy.firstName} ${requestedBy.lastName ?? ''}`.trim() : 'Admin';

    return this.notifications.createNotification(companyId, requestedById, {
      type: NotificationType.SYSTEM,
      title: 'Location Request',
      message: `${requestedByName} requested your current location.`,
      recipientIds: [employeeId],
      expiresAt,
      metadata: {
        kind: 'STAFF_LOCATION_REQUEST',
        requestedById,
      },
    });
  }

  async getMyPendingRequests(employeeId: string) {
    const prisma = this.prisma as any;
    const now = new Date();
    const rows = await prisma.notificationRecipient.findMany({
      where: {
        employeeId,
        readAt: null,
        notification: {
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
          metadata: { path: ['kind'], equals: 'STAFF_LOCATION_REQUEST' },
        },
      },
      orderBy: { notification: { createdAt: 'desc' } },
      include: {
        notification: {
          select: {
            id: true,
            title: true,
            message: true,
            metadata: true,
            createdAt: true,
            expiresAt: true,
            createdById: true,
          },
        },
      },
      take: 20,
    });

    return rows.map((r) => ({
      notificationId: r.notification.id,
      title: r.notification.title,
      message: r.notification.message,
      createdAt: r.notification.createdAt,
      expiresAt: r.notification.expiresAt,
      requestedById: r.notification.createdById ?? (r.notification.metadata as any)?.requestedById ?? null,
    }));
  }

  async respondToRequest(
    companyId: string,
    employeeId: string,
    dto: {
      notificationId: string;
      action: 'ACCEPT' | 'DENY';
      latitude?: number;
      longitude?: number;
      accuracy?: number;
    },
  ) {
    const prisma = this.prisma as any;
    const notif = await prisma.notification.findFirst({
      where: { id: dto.notificationId, companyId },
      select: {
        id: true,
        createdById: true,
        metadata: true,
        title: true,
        message: true,
      },
    });
    if (!notif) throw new NotFoundException('Request not found');

    const kind = (notif.metadata as any)?.kind;
    if (kind !== 'STAFF_LOCATION_REQUEST') {
      throw new ForbiddenException('Not a staff location request');
    }

    const recipient = await prisma.notificationRecipient.findFirst({
      where: { employeeId, notificationId: dto.notificationId },
      select: { id: true, readAt: true },
    });
    if (!recipient) throw new ForbiddenException('Not allowed');

    const requestedById = notif.createdById ?? (notif.metadata as any)?.requestedById ?? null;

    if (dto.action === 'ACCEPT') {
      if (
        typeof dto.latitude !== 'number' ||
        typeof dto.longitude !== 'number' ||
        !Number.isFinite(dto.latitude) ||
        !Number.isFinite(dto.longitude)
      ) {
        throw new ForbiddenException('Latitude/longitude required');
      }

      await this.capture(companyId, employeeId, {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        requestedById: requestedById ?? undefined,
      });

      await this.notifications.markAsRead(employeeId, Designation.SALES_EXECUTIVE, [], dto.notificationId);

      if (requestedById) {
        const emp = await prisma.employee.findFirst({
          where: { id: employeeId },
          select: { firstName: true, lastName: true },
        });
        const name = emp ? `${emp.firstName} ${emp.lastName ?? ''}`.trim() : 'Employee';
        await this.notifications.createNotification(companyId, employeeId, {
          type: NotificationType.SYSTEM,
          title: 'Location Shared',
          message: `${name} shared their location.`,
          recipientIds: [requestedById],
          metadata: { kind: 'STAFF_LOCATION_RESPONSE', action: 'ACCEPT', employeeId },
        });
      }

      return { success: true };
    }

    await this.notifications.markAsRead(employeeId, Designation.SALES_EXECUTIVE, [], dto.notificationId);

    if (requestedById) {
      const emp = await prisma.employee.findFirst({
        where: { id: employeeId },
        select: { firstName: true, lastName: true },
      });
      const name = emp ? `${emp.firstName} ${emp.lastName ?? ''}`.trim() : 'Employee';
      await this.notifications.createNotification(companyId, employeeId, {
        type: NotificationType.SYSTEM,
        title: 'Location Denied',
        message: `${name} denied the location request.`,
        recipientIds: [requestedById],
        metadata: { kind: 'STAFF_LOCATION_RESPONSE', action: 'DENY', employeeId },
      });
    }

    return { success: true };
  }
}
