import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsNotEmpty } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class RefreshTokenDto {
  @ApiProperty()
  @IsJWT({ message: i18nValidationMessage('validation.INVALID_JWT') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  refreshToken: string;
}
