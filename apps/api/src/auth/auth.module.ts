import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GithubOAuthService } from './github-oauth.service';

@Module({ controllers: [AuthController], providers: [AuthService, GithubOAuthService] })
export class AuthModule {}
