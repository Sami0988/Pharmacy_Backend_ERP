import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_KEY } from '../decorators/public.decorator';

interface MfaRequest {
  user?: { mfaEnabled?: boolean; mfaVerified?: boolean };
}

@Injectable()
export class MfaGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<MfaRequest>();
    const user = request.user;

    if (!user) {
      return true;
    }

    if (user.mfaEnabled && !user.mfaVerified) {
      return false;
    }

    return true;
  }
}
