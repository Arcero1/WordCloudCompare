export type PdfSide = "left" | "right";

interface StoredPdf {
  side: PdfSide;
  name: string;
  type: string;
  lastModified: number;
  data: ArrayBuffer;
}

const DB_NAME = "wordcloud-compare";
const STORE_NAME = "pdfs";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "side" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePdfForSide(side: PdfSide, file: File): Promise<void> {
  const db = await openDatabase();
  const data = await file.arrayBuffer();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: StoredPdf = {
      side,
      name: file.name,
      type: file.type || "application/pdf",
      lastModified: file.lastModified,
      data,
    };

    store.put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function loadPdfForSide(side: PdfSide): Promise<File | null> {
  const db = await openDatabase();

  const record = await new Promise<StoredPdf | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(side);

    request.onsuccess = () => resolve(request.result as StoredPdf | undefined);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });

  if (!record) return null;
  return new File([record.data], record.name, {
    type: record.type || "application/pdf",
    lastModified: record.lastModified,
  });
}

export async function removePdfForSide(side: PdfSide): Promise<void> {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(side);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
