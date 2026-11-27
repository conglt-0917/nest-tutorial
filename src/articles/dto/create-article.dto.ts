import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { trimString } from '../../common/utils/string.util.js';
import {
  BODY_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '../articles.constants.js';

export class CreateArticleDto {
  @ApiProperty({
    example: 'How to train your dragon',
    maxLength: TITLE_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @MaxLength(TITLE_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH'),
  })
  title: string;

  @ApiProperty({
    example: 'Ever wonder how?',
    maxLength: DESCRIPTION_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @MaxLength(DESCRIPTION_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH'),
  })
  description: string;

  @ApiProperty({ example: 'You have to believe', maxLength: BODY_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') })
  @MaxLength(BODY_MAX_LENGTH, {
    message: i18nValidationMessage('validation.MAX_LENGTH'),
  })
  body: string;
}
