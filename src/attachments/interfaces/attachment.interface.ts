import type {
  ATTACHABLE_TYPE,
  ATTACHMENT_KIND,
} from '../attachments.constants.js';

export type AttachableType =
  (typeof ATTACHABLE_TYPE)[keyof typeof ATTACHABLE_TYPE];

export type AttachmentKind =
  (typeof ATTACHMENT_KIND)[keyof typeof ATTACHMENT_KIND];


export interface AttachableRef {
  type: AttachableType;
  id: string;
}

export interface StoredFile {
  id: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface UploadedFileData {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
