import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminPermission } from '@prisma/client';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

type AdminRequest = {
  user: { permissions: AdminPermission[] };
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<AdminPermission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<AdminRequest>();
    return required.every((permission) =>
      request.user.permissions.includes(permission),
    );
  }
}
