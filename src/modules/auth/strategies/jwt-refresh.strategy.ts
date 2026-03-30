// ============================================================
// src/modules/auth/strategies/jwt-refresh.strategy.ts
// ============================================================
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
 
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('jwt.refreshSecret')!,
      passReqToCallback: true,
    });
  }
 
  validate(req: Request, payload: any) {
    const refreshToken = req.get('Authorization')?.replace('Bearer ', '').trim();
    return { ...payload, refreshToken };
  }
}