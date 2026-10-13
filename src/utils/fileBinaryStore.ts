/**
 * In-memory client binary store to preserve exact browser File objects and buffers
 * for lossless, uncompressed metadata embedding.
 */

interface StoredBinary {
  file: File;
  buffer?: ArrayBuffer;
  embeddedBlob?: Blob;
  embeddedAt?: string;
}

const store = new Map<string, StoredBinary>();

export const fileBinaryStore = {
  set(id: string, file: File, buffer?: ArrayBuffer) {
    store.set(id, { file, buffer });
  },

  get(id: string): StoredBinary | undefined {
    return store.get(id);
  },

  getFile(id: string): File | undefined {
    return store.get(id)?.file;
  },

  setEmbedded(id: string, blob: Blob) {
    const existing = store.get(id);
    if (existing) {
      existing.embeddedBlob = blob;
      existing.embeddedAt = new Date().toISOString();
    }
  },

  getEmbedded(id: string): Blob | undefined {
    return store.get(id)?.embeddedBlob;
  },

  hasEmbedded(id: string): boolean {
    return !!store.get(id)?.embeddedBlob;
  },

  has(id: string): boolean {
    return store.has(id);
  },

  delete(id: string) {
    store.delete(id);
  },

  clear() {
    store.clear();
  },
};
