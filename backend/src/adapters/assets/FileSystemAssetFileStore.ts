import { AssetFileStore } from '../../ports/AssetFileStore';
import { deleteFile } from '../../utils/fileUtils';

/** Local-disk implementation. A future S3/R2 adapter can implement the same port. */
export class FileSystemAssetFileStore implements AssetFileStore {
  async remove(filePath: string): Promise<void> {
    await deleteFile(filePath);
  }
}
