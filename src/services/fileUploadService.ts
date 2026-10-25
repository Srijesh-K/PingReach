import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { initializeApp, getApps, getApp } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const storage = getStorage(app);

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Upload any file (images, videos, audio, documents, etc.)
 * Strategy 1: Firebase Storage
 * Strategy 2: Resilient free file hosting fallback (tmpfiles.org)
 */
export async function uploadChatFile(
  file: File,
  chatId: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `chat_uploads/${chatId}/${Date.now()}_${sanitizedName}`;

  // 1. Attempt upload to Firebase Storage
  try {
    const storageRef = ref(storage, path);
    onProgress?.(20);
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type || 'application/octet-stream',
    });
    onProgress?.(80);
    const downloadUrl = await getDownloadURL(snapshot.ref);
    onProgress?.(100);
    return downloadUrl;
  } catch (storageError) {
    console.warn('Firebase Storage upload failed or restricted, using direct file gateway:', storageError);
  }

  // 2. Resilient fallback: tmpfiles.org public file gateway (supports any file type up to 5GB)
  onProgress?.(30);
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed with server status ${response.status}`);
  }

  const result = await response.json();
  if (result.status === 'success' && result.data?.url) {
    // tmpfiles.org returns URL like https://tmpfiles.org/12345/filename.png
    // The direct stream/download URL is https://tmpfiles.org/dl/12345/filename.png
    const directUrl = result.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    onProgress?.(100);
    return directUrl;
  }

  throw new Error('Unable to complete file upload.');
}
