import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../common.constants.js';

export class PaginationQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    default: DEFAULT_PAGE_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(1, { message: i18nValidationMessage('validation.MIN') })
  @Max(MAX_PAGE_LIMIT, { message: i18nValidationMessage('validation.MAX') })
  limit: number = DEFAULT_PAGE_LIMIT;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(0, { message: i18nValidationMessage('validation.MIN') })
  offset: number = 0;
}
