import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  function mockHost(exception: unknown) {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const request = { url: '/test' };
    return {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
      response,
      request,
    };
  }

  it('should handle HttpException', () => {
    const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);
    const host = mockHost(exception);
    filter.catch(exception, host as any);
    expect(host.response.status).toHaveBeenCalledWith(400);
    expect(host.response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Bad request' }),
    );
  });

  it('should handle unknown exceptions without leaking details in production', () => {
    process.env.NODE_ENV = 'production';
    const exception = new Error('secret internal detail');
    const host = mockHost(exception);
    filter.catch(exception, host as any);
    expect(host.response.status).toHaveBeenCalledWith(500);
    const body = host.response.json.mock.calls[0][0];
    expect(body.message).toBe('Internal server error');
    delete process.env.NODE_ENV;
  });

  it('should show error message in non-production', () => {
    delete process.env.NODE_ENV;
    const exception = new Error('debug info');
    const host = mockHost(exception);
    filter.catch(exception, host as any);
    const body = host.response.json.mock.calls[0][0];
    expect(body.message).toBe('debug info');
  });
});
