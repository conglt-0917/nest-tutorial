import { ApiProperty } from '@nestjs/swagger';
import type { TokenPair } from '../interfaces/jwt-payload.interface.js';

export class TokenPairDto implements TokenPair {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;
}
