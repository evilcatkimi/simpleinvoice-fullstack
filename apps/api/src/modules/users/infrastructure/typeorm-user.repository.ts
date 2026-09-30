import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { UserRepository } from '../application/user.repository';
import type { User, UserCredentials } from '../domain/user';
import { UserEntity } from './user.entity';

@Injectable()
export class TypeOrmUserRepository implements UserRepository {
  constructor(@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>) {}

  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    // lower(email) matches the unique functional index, so this is an index lookup.
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('lower(user.email) = lower(:email)', { email })
      .getOne();
    return user && { ...toUser(user), passwordHash: user.passwordHash };
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.users.findOneBy({ id });
    return user && toUser(user);
  }
}

function toUser({ id, email, fullname, createdAt }: UserEntity): User {
  return { id, email, fullname, createdAt };
}
