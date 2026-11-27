import { randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import {
  BadRequestException,
  FileTypeValidator,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { sanitizeFileName } from '../common/utils/file.util.js';
import { In } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { Attachment } from './attachment.entity.js';
import { AttachmentStorageService } from './attachment-storage.service.js';
import {
  ATTACHMENTS_ROUTE,
  AVATAR_MIME_EXTENSIONS,
  FILE_NAME_MAX_LENGTH,
} from './attachments.constants.js';
import type {
  AttachableRef,
  AttachableType,
  AttachmentKind,
  StoredFile,
  UploadedFileData,
} from './interfaces/attachment.interface.js';

@Injectable()
export class AttachmentsService {
  // sunlint-disable-next-line C014 -- Nest's standard per-class logger
  private readonly logger = new Logger(AttachmentsService.name);
  // sunlint-disable-next-line C014 -- stateless validator configured with constants; nothing to inject
  private readonly imageTypeValidator = new FileTypeValidator({
    fileType: new RegExp(
      `^(${Object.keys(AVATAR_MIME_EXTENSIONS)
        .map((type) => type.replace('/', '\\/'))
        .join('|')})$`,
    ),
    overrideMimeType: true,
  });

  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentsRepository: Repository<Attachment>,
    private readonly storage: AttachmentStorageService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Validates an image upload and writes it to storage under a random name.
   * Returns the file's metadata; saving it to the database is up to the caller
   * (see replaceSingle), which must call removeFiles if that fails.
   */
  async storeImage(file: UploadedFileData): Promise<StoredFile> {
    const mimeType = await this.detectImageType(file);
    const id = randomUUID();
    const storageKey = `${id}${AVATAR_MIME_EXTENSIONS[mimeType]}`;
    await this.storage.write(storageKey, file.buffer);
    return {
      id,
      storageKey,
      fileName: sanitizeFileName(file.originalname, FILE_NAME_MAX_LENGTH),
      mimeType,
      size: file.buffer.length,
    };
  }

  /**
   * Makes `stored` the only attachment of `kind` for `owner`, inside the
   * caller's transaction. Returns the storage keys of the replaced
   * attachments: delete them with removeFiles once the transaction commits.
   */
  async replaceSingle(
    manager: EntityManager,
    owner: AttachableRef,
    kind: AttachmentKind,
    stored: StoredFile,
  ): Promise<{ attachment: Attachment; removedKeys: string[] }> {
    // sunlint-disable-next-line C033 -- the attachments repository bound to the caller's transaction
    const repository = manager.getRepository(Attachment);
    const where = { attachableType: owner.type, attachableId: owner.id, kind };
    const previous = await repository.find({ where });
    if (previous.length > 0) await repository.delete(where);

    const attachment = await repository.save(
      repository.create({
        id: stored.id,
        attachableType: owner.type,
        attachableId: owner.id,
        kind,
        url: attachmentUrl(stored.id),
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        size: stored.size,
        storageKey: stored.storageKey,
      }),
    );
    return { attachment, removedKeys: previous.map((a) => a.storageKey) };
  }

  findById(id: string): Promise<Attachment | null> {
    return this.attachmentsRepository.findOneBy({ id });
  }

  async findUrl(
    owner: AttachableRef,
    kind: AttachmentKind,
  ): Promise<string | null> {
    const attachment = await this.attachmentsRepository.findOne({
      select: { id: true, url: true },
      where: { attachableType: owner.type, attachableId: owner.id, kind },
    });
    return attachment?.url ?? null;
  }

  async findUrls(
    ownerType: AttachableType,
    ownerIds: string[],
    kind: AttachmentKind,
  ): Promise<Map<string, string>> {
    if (ownerIds.length === 0) return new Map();
    const attachments = await this.attachmentsRepository.find({
      select: { attachableId: true, url: true },
      where: { attachableType: ownerType, attachableId: In(ownerIds), kind },
    });
    return new Map(attachments.map((a) => [a.attachableId, a.url]));
  }

  /** 404 when the file is missing from storage. */
  async openFile(attachment: Attachment): Promise<ReadStream> {
    const stream = await this.storage.open(attachment.storageKey);
    if (!stream) {
      this.logger.warn(`File of attachment ${attachment.id} is missing`);
      throw this.notFound();
    }
    return stream;
  }

  /** Best effort: a file that cannot be removed is logged, not thrown. */
  async removeFiles(keys: string[]): Promise<void> {
    const results = await Promise.allSettled(
      keys.map((key) => this.storage.remove(key)),
    );
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Could not remove file ${keys[i]}: ${String(result.reason)}`,
        );
      }
    });
  }

  notFound(): NotFoundException {
    return new NotFoundException(this.i18n.t('attachments.NOT_FOUND'));
  }

  private async detectImageType(file: UploadedFileData): Promise<string> {
    // A copy, because the validator overwrites mimetype with the detected type.
    const probe = {
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    };
    if (!(await this.imageTypeValidator.isValid(probe))) {
      throw new BadRequestException(
        this.i18n.t('attachments.INVALID_IMAGE_TYPE'),
      );
    }
    return probe.mimetype;
  }
}

export function attachmentUrl(id: string): string {
  return `/${ATTACHMENTS_ROUTE}/${id}`;
}
