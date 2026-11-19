export type TokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  email: string;
  jti: string;
  type: TokenType;
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  jti: string;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
