import { access, mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { BlobStorage } from '../../ports/BlobStorage';

/**
 * Filesystem implementation of BlobStorage. Storage keys are constrained to
 * the configured root so an adapter caller cannot turn a blob operation into
 * an arbitrary filesystem operation.
 */
export class FileSystemBlobStorage implements BlobStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async put(key: string, contents: Buffer, _contentType: string): Promise<void> {
    const destination = this.resolveKey(key);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolveKey(key));
    } catch (error: unknown) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error: unknown) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolveKey(key));
      return true;
    } catch (error: unknown) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  private resolveKey(key: string): string {
    if (!key || path.isAbsolute(key)) {
      throw new Error('Blob storage keys must be non-empty relative paths');
    }

    const candidate = path.resolve(this.root, key);
    if (candidate === this.root || !candidate.startsWith(`${this.root}${path.sep}`)) {
      throw new Error('Blob storage key must remain inside the configured root');
    }

    return candidate;
  }
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT';
}
