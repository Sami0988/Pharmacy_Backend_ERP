import { ExecutionContext } from '@nestjs/common';

// Inline the decorator factory to test it directly
function currentUserFactory(data: string | undefined, ctx: ExecutionContext) {
  const request = ctx
    .switchToHttp()
    .getRequest<{ user?: Record<string, unknown> }>();
  const user = request.user;
  return data ? user?.[data] : user;
}

describe('CurrentUser decorator factory', () => {
  const mockRequest = {
    user: { sub: 'user-1', email: 'test@test.com', role: 'admin' },
  };

  function mockExecutionContext() {
    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  }

  it('should return full user if no data key', () => {
    const result = currentUserFactory(undefined, mockExecutionContext());
    expect(result).toEqual(mockRequest.user);
  });

  it('should return specific field if data key provided', () => {
    const result = currentUserFactory('sub', mockExecutionContext());
    expect(result).toBe('user-1');
  });

  it('should return undefined for missing field', () => {
    const result = currentUserFactory('missing', mockExecutionContext());
    expect(result).toBeUndefined();
  });

  it('should return undefined if no user in request', () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    } as unknown as ExecutionContext;
    const result = currentUserFactory(undefined, ctx);
    expect(result).toBeUndefined();
  });
});
