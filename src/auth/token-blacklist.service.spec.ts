import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import { TokenBlacklistService } from './token-blacklist.service.js';

describe('TokenBlacklistService', () => {
  const NOW_SECONDS = 1_800_000_000;
  const redisMock = { set: vi.fn(), exists: vi.fn() };
  let service: TokenBlacklistService;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_SECONDS * 1000);
    redisMock.set.mockReset();
    redisMock.exists.mockReset();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TokenBlacklistService,
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();
    service = moduleRef.get(TokenBlacklistService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('revoke', () => {
    it('stores the jti with a TTL equal to the remaining token lifetime', async () => {
      redisMock.set.mockResolvedValue('OK');

      await expect(service.revoke('jti-1', NOW_SECONDS + 900)).resolves.toBe(
        true,
      );
      expect(redisMock.set).toHaveBeenCalledWith(
        'auth:blacklist:jti-1',
        '1',
        'EX',
        900,
        'NX',
      );
    });

    it('returns false when the jti is already revoked (SET NX returns null)', async () => {
      redisMock.set.mockResolvedValue(null);

      await expect(service.revoke('jti-1', NOW_SECONDS + 900)).resolves.toBe(
        false,
      );
    });

    it('skips tokens that have already expired', async () => {
      await expect(service.revoke('jti-1', NOW_SECONDS)).resolves.toBe(false);
      expect(redisMock.set).not.toHaveBeenCalled();
    });
  });

  describe('isRevoked', () => {
    it.each([
      [1, true],
      [0, false],
    ])('maps EXISTS=%i to %s', async (exists, expected) => {
      redisMock.exists.mockResolvedValue(exists);

      await expect(service.isRevoked('jti-1')).resolves.toBe(expected);
      expect(redisMock.exists).toHaveBeenCalledWith('auth:blacklist:jti-1');
    });
  });
});
