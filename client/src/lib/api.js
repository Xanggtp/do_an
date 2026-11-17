function toError(response, data) {
  const error = new Error(data.message || data.error || 'Something went wrong.');
  error.status = response.status;
  error.data = data;
  return error;
}

const api = async (path, options = {}) => {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      // Let the browser set the multipart boundary for FormData bodies
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw toError(response, data);
  return data;
};

/**
 * Uploads FormData with real progress events (fetch has no upload progress).
 * Returns { promise, abort }.
 */
export function uploadWithProgress(path, formData, onProgress) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    xhr.open('POST', path);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { data = {}; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(toError({ status: xhr.status }, data));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading. Please try again.'));
    xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled.'), { aborted: true }));
    xhr.send(formData);
  });
  return { promise, abort: () => xhr.abort() };
}

export default api;
