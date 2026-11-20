import type { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { CurrentUser } from './current-user.decorator.js';

function getFactory() {
  class Target {
    handler(@CurrentUser() _user: unknown) {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Target, 'handler');
  const [entry] = Object.values(args) as {
    factory: (data: unknown, ctx: ExecutionContext) => unknown;
  }[];
  return entry.factory;
}

describe('@CurrentUser()', () => {
  it('returns request.user set by the AuthGuard', () => {
    const user = { id: 'u1', email: 'a@b.c', jti: 'j', exp: 1 };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;

    expect(getFactory()(undefined, ctx)).toBe(user);
  });
});
