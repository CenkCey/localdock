import { uploadUrl, uploadErrorText } from './protocol.js';

export function uploadFile(base, key, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl(base, key, file.name || 'file'));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new Error(uploadErrorText(0)));
    xhr.onabort = () => reject(new Error(uploadErrorText(0)));
    xhr.ontimeout = () => reject(new Error(uploadErrorText(0)));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let saved = file.name;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body && body.file) saved = body.file;
        } catch {
          saved = file.name;
        }
        if (onProgress) onProgress(1);
        resolve({ file: saved });
        return;
      }
      reject(new Error(uploadErrorText(xhr.status)));
    };
    xhr.send(file);
  });
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
