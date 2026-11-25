import type { ReadStream } from 'node:fs';
import type { Attachment } from '../attachment.entity.js';

export interface ViewableFile {
  attachment: Attachment;
  stream: ReadStream;
}
