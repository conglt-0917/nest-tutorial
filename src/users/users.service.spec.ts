import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  const queryBuilderMock = {
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
  };
  const repositoryMock = {
    findOneBy: vi.fn(),
    existsBy: vi.fn(),
    createQueryBuilder: vi.fn(() => queryBuilderMock),
    create: vi.fn((data: Partial<User>) => ({ ...data })),
    save: vi.fn((user: Partial<User>) =>
      Promise.resolve({ id: 'u1', ...user }),
    ),
  };
  let service: UsersService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repositoryMock },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('findById looks the user up by id', async () => {
    const user = { id: 'u1' };
    repositoryMock.findOneBy.mockResolvedValue(user);

    await expect(service.findById('u1')).resolves.toBe(user);
    expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: 'u1' });
  });

  it('findById returns null for an unknown id', async () => {
    repositoryMock.findOneBy.mockResolvedValue(null);

    await expect(service.findById('missing')).resolves.toBeNull();
  });

  it.each([true, false])('existsByEmail returns %s', async (exists) => {
    repositoryMock.existsBy.mockResolvedValue(exists);

    await expect(service.existsByEmail('a@b.c')).resolves.toBe(exists);
    expect(repositoryMock.existsBy).toHaveBeenCalledWith({ email: 'a@b.c' });
  });

  it('findByEmailWithPassword explicitly selects the hidden password column', async () => {
    const user = { id: 'u1', password: 'hash' };
    queryBuilderMock.getOne.mockResolvedValue(user);

    await expect(service.findByEmailWithPassword('a@b.c')).resolves.toBe(user);
    expect(repositoryMock.createQueryBuilder).toHaveBeenCalledWith('user');
    expect(queryBuilderMock.addSelect).toHaveBeenCalledWith('user.password');
    // Parameterized, never string-concatenated.
    expect(queryBuilderMock.where).toHaveBeenCalledWith('user.email = :email', {
      email: 'a@b.c',
    });
  });

  it('create stores the hash in the password column and saves the user', async () => {
    const saved = await service.create({
      email: 'a@b.c',
      passwordHash: '$2b$10$hash',
      name: 'A',
    });

    expect(repositoryMock.create).toHaveBeenCalledWith({
      email: 'a@b.c',
      password: '$2b$10$hash',
      name: 'A',
    });
    expect(repositoryMock.save).toHaveBeenCalledTimes(1);
    expect(saved).toMatchObject({ id: 'u1', email: 'a@b.c' });
  });

  it('create propagates database errors', async () => {
    const error = new Error('db down');
    repositoryMock.save.mockRejectedValueOnce(error);

    await expect(
      service.create({ email: 'a@b.c', passwordHash: 'h', name: 'A' }),
    ).rejects.toBe(error);
  });
});
