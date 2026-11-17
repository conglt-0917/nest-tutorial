import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;
  const i18nMock = { t: vi.fn().mockReturnValue('Hello') };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: I18nService, useValue: i18nMock }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return the translated greeting', () => {
      expect(appController.getHello()).toBe('Hello');
      expect(i18nMock.t).toHaveBeenCalledWith('test.HELLO');
    });
  });
});
