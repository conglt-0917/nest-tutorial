import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { AuthGuard } from './auth.guard.js';
import type { JwtPayload } from './interfaces/jwt-payload.interface.js';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { TokenService } from './token.service.js';

const payload: JwtPayload = {
  sub: 'user-1',
  email: 'user@example.com',
  jti: 'jti-1',
  type: 'access',
  iat: 1,
  exp: 2,
};

function createContext(authorization?: string) {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('AuthGuard', () => {
  const reflectorMock = { getAllAndOverride: vi.fn() };
  const tokenServiceMock = { verify: vi.fn() };
  const blacklistMock = { isRevoked: vi.fn() };
  const i18nMock = { t: vi.fn((key: string) => key) };
  let guard: AuthGuard;

  beforeEach(async () => {
    vi.clearAllMocks();
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    tokenServiceMock.verify.mockResolvedValue(payload);
    blacklistMock.isRevoked.mockResolvedValue(false);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        { provide: Reflector, useValue: reflectorMock },
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: TokenBlacklistService, useValue: blacklistMock },
        { provide: I18nService, useValue: i18nMock },
      ],
    }).compile();
    guard = moduleRef.get(AuthGuard);
  });

  it('lets @Public() routes through without a token', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const { context } = createContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tokenServiceMock.verify).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['non-Bearer', 'Basic abc'],
    ['empty Bearer', 'Bearer '],
  ])('rejects a %s Authorization header', async (_label, header) => {
    const { context } = createContext(header);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('auth.UNAUTHORIZED'),
    );
    expect(tokenServiceMock.verify).not.toHaveBeenCalled();
  });

  it('rejects a token that does not verify as an access token', async () => {
    tokenServiceMock.verify.mockResolvedValue(null);
    const { context } = createContext('Bearer refresh-or-garbage');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tokenServiceMock.verify).toHaveBeenCalledWith(
      'refresh-or-garbage',
      'access',
    );
  });

  it('rejects a revoked (logged out) token', async () => {
    blacklistMock.isRevoked.mockResolvedValue(true);
    const { context } = createContext('Bearer token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(blacklistMock.isRevoked).toHaveBeenCalledWith('jti-1');
  });

  it('attaches the authenticated user to the request', async () => {
    const { context, request } = createContext('Bearer token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      jti: 'jti-1',
      exp: 2,
    });
  });

  it('checks @Public() on both the handler and the controller', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const { context } = createContext();

    await guard.canActivate(context);

    expect(reflectorMock.getAllAndOverride).toHaveBeenCalledWith('isPublic', [
      expect.any(Function),
      expect.any(Function),
    ]);
  });

  it('does not hit Redis when the token fails verification', async () => {
    tokenServiceMock.verify.mockResolvedValue(null);
    const { context } = createContext('Bearer bad');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(blacklistMock.isRevoked).not.toHaveBeenCalled();
  });

  it('does not attach a user when the token is rejected', async () => {
    blacklistMock.isRevoked.mockResolvedValue(true);
    const { context, request } = createContext('Bearer token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
  });

  it('propagates a Redis outage instead of letting the request through', async () => {
    blacklistMock.isRevoked.mockRejectedValue(new Error('ECONNREFUSED'));
    const { context } = createContext('Bearer token');

    await expect(guard.canActivate(context)).rejects.toThrow('ECONNREFUSED');
  });
});
