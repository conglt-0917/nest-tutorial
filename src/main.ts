import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  DEFAULT_PORT,
  NODE_ENV_KEY,
  PORT_KEY,
  PRODUCTION,
} from './config/app.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  if (configService.get<string>(NODE_ENV_KEY) !== PRODUCTION) {
    const config = new DocumentBuilder()
      .setTitle('Nest Tutorial')
      .setDescription('API description')
      .setVersion('1.0')
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory);
  }

  await app.listen(configService.get<number>(PORT_KEY) ?? DEFAULT_PORT);
}
await bootstrap();
