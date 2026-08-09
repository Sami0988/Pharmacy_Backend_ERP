import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MfaGuard } from './mfa.guard';

describe('MfaGuard', () => {
  let guard: MfaGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as any;
    guard = new MfaGuard(reflector);
  });

  function mockContext(user?: { mfaEnabled?: boolean; mfaVerified?: boolean }) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should allow public routes', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    expect(guard.canActivate(mockContext())).toBe(true);
  });

  it('should allow if no user in request', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    expect(guard.canActivate(mockContext())).toBe(true);
  });

  it('should allow if MFA not enabled', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    expect(guard.canActivate(mockContext({ mfaEnabled: false }))).toBe(true);
  });

  it('should allow if MFA enabled and verified', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    expect(
      guard.canActivate(mockContext({ mfaEnabled: true, mfaVerified: true })),
    ).toBe(true);
  });

  it('should reject if MFA enabled but not verified', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    expect(guard.canActivate(mockContext({ mfaEnabled: true }))).toBe(false);
  });
});
