import { useEffect, useState } from 'react';

/**
 * Card images live in IndexedDB, not localStorage: a handful of photos would fill
 * localStorage's ~5 MB. Images are downscaled before they're stored.
 */

const DB_NAME = 'margin-images';
const STORE = 'images';
const MAX_SIDE = 1800;

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = run(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const putImage = (id: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, id));
export const getImage = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id));

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

/** Decode, shrink to at most MAX_SIDE px on the long edge, and re-encode as WebP (JPEG fallback). */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : canvas.toBlob((j) => (j ? resolve(j) : reject(new Error('encode failed'))), 'image/jpeg', 0.88)),
      'image/webp',
      0.88,
    ),
  );
  return { blob, width, height };
}

/** Object URL for a stored image; null while loading, 'missing' if it isn't in this browser. */
export function useImageUrl(id: string | undefined): string | null | 'missing' {
  const [url, setUrl] = useState<string | null | 'missing'>(null);
  useEffect(() => {
    if (!id) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    getImage(id)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) return setUrl('missing');
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setUrl('missing'));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return url;
}
