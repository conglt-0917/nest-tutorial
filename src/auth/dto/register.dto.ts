import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { normalizeEmail, trimString } from '../../common/utils/string.util.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth.constants.js';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsEmail({}, { message: i18nValidationMessage('validation.INVALID_EMAIL') })
  @MaxLength(255, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  email: string;

  @ApiProperty({
    example: 'Secret123!',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: i18nValidationMessage('validation.MIN_LENGTH'),
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH'),
  })
  password: string;

  @ApiProperty({ example: 'Nguyen Van A', maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @MaxLength(100, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  name: string;
}
