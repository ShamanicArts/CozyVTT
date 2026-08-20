import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import { FileSystemBlobStorage } from './FileSystemBlobStorage';

describe('FileSystemBlobStorage', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'cozyvtt-blob-storage-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores, retrieves, and deletes a blob by a storage-relative key', async () => {
    const storage = new FileSystemBlobStorage(root);

    await storage.put('campaigns/demo/map.png', Buffer.from('map-data'), 'image/png');

    await expect(storage.exists('campaigns/demo/map.png')).resolves.toBe(true);
    await expect(storage.get('campaigns/demo/map.png')).resolves.toEqual(Buffer.from('map-data'));

    await storage.delete('campaigns/demo/map.png');
    await expect(storage.get('campaigns/demo/map.png')).resolves.toBeNull();
  });

  it('rejects keys that escape the configured storage root', async () => {
    const storage = new FileSystemBlobStorage(root);

    await expect(storage.put('../outside.txt', Buffer.from('nope'), 'text/plain')).rejects.toThrow(
      'must remain inside the configured root'
    );
  });
});
