import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.usersRepository.existsBy({ email });
  }

  /** Includes the password hash, which is excluded from normal selects. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  create(input: CreateUserInput): Promise<User> {
    const user = this.usersRepository.create({
      email: input.email,
      password: input.passwordHash,
      name: input.name,
    });
    return this.usersRepository.save(user);
  }
}
