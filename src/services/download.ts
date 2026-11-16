import { registerPlugin } from '@capacitor/core';
import { isAndroid } from '../lib/platform';

/**
 * Bridge to the native DownloadPlugin (android/app/src/main/java/...).
 * On Android the WebView cannot reliably trigger a browser download, so the
 * file is written straight into the device's Downloads/KALAI DIGITAL folder.
 */
interface DownloadPlugin {
  saveToDownloads(options: { data: string; filename: string; mime?: string }): Promise<{
    uri?: string;
    path?: string;
    filename: string;
  }>;
}

const NativeDownload = registerPlugin<DownloadPlugin>('Download');

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });
}

export function browserDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Save a file on the current platform.
 * Returns 'native' when it was written by the Android plugin, otherwise
 * 'browser' when the anchor-download path was used.
 */
export async function saveFile(filename: string, data: Blob | string, mime = 'application/octet-stream'): Promise<'native' | 'browser'> {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
  if (isAndroid()) {
    const base64 = await blobToBase64(blob);
    await NativeDownload.saveToDownloads({ data: base64, filename, mime });
    return 'native';
  }
  browserDownload(filename, blob);
  return 'browser';
}
