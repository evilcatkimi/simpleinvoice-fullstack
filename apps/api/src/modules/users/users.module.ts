import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRepository } from './application/user.repository';
import { TypeOrmUserRepository } from './infrastructure/typeorm-user.repository';
import { UserEntity } from './infrastructure/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [{ provide: UserRepository, useClass: TypeOrmUserRepository }],
  exports: [UserRepository],
})
export class UsersModule {}
