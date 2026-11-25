import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { trimString } from '../../common/utils/string.util.js';
import { BIO_MAX_LENGTH, NAME_MAX_LENGTH } from '../users.constants.js';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Nguyen Van A', maxLength: NAME_MAX_LENGTH })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @MaxLength(NAME_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH'),
  })
  name?: string;

  @ApiPropertyOptional({
    example: 'Backend developer',
    maxLength: BIO_MAX_LENGTH,
    description: 'An empty value clears the bio',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MaxLength(BIO_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH'),
  })
  bio?: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'PNG, JPEG or WebP image, at most 2 MB',
  })
  avatar?: unknown;
}
