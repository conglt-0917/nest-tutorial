import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_UPLOAD_DIR, UPLOAD_DIR_KEY } from '../config/app.config.js';
import { FILE_NOT_FOUND_CODE } from './attachments.constants.js';
import { InvalidStorageKeyError } from './errors/invalid-storage-key.error.js';

@Injectable()
export class AttachmentStorageService implements OnModuleInit {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(
      config.get<string>(UPLOAD_DIR_KEY) ?? DEFAULT_UPLOAD_DIR,
    );
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async write(key: string, data: Buffer): Promise<void> {
    await writeFile(this.pathOf(key), data, { flag: 'wx' });
  }

  async open(key: string): Promise<ReadStream | null> {
    const path = this.pathOf(key);
    const stats = await stat(path).catch((error: unknown) => {
      if (isNotFound(error)) return null;
      // sunlint-disable-next-line C018, C030 -- other I/O errors are rethrown unchanged to keep the stack; Nest logs them
      throw error;
    });
    return stats?.isFile() ? createReadStream(path) : null;
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  pathOf(key: string): string {
    const path = resolve(this.root, key);
    const rel = relative(this.root, path);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      throw new InvalidStorageKeyError(key);
    }
    return path;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    (error as NodeJS.ErrnoException | undefined)?.code === FILE_NOT_FOUND_CODE
  );
}
