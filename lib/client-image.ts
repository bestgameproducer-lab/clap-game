const MAX_EVIDENCE_BYTES = 1_800_000;
const STARTING_MAX_DIMENSION = 1600;
const MAX_AVATAR_BYTES = 800_000;
const AVATAR_DIMENSION = 720;

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('这张照片无法处理，请换一张后重试'));
    }, 'image/jpeg', quality);
  });
}

type LoadedBrowserImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
};

async function loadBrowserImage(file: File): Promise<LoadedBrowserImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
    } catch {
      // Older WeChat and Safari engines fall back to the decoded <img> below.
    }
  }
  return new Promise<LoadedBrowserImage>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => {} });
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取这张照片，请使用 JPG、PNG 或 WebP 图片')); };
    image.src = url;
  });
}

export async function compressTaskEvidence(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('请选择照片文件');
  const image = await loadBrowserImage(file);
  try {
    let maximumDimension = STARTING_MAX_DIMENSION;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = Math.min(1, maximumDimension / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('当前浏览器无法处理照片，请直接到任务站出示');
      context.drawImage(image.source, 0, 0, width, height);
      const blob = await canvasBlob(canvas, Math.max(0.55, 0.82 - attempt * 0.07));
      if (blob.size <= MAX_EVIDENCE_BYTES) return blob;
      maximumDimension = Math.round(maximumDimension * 0.78);
    }
  } finally {
    image.dispose();
  }
  throw new Error('照片仍然过大，请截图后重新上传，或直接到任务站出示');
}

export async function compressProfileAvatar(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('请选择照片文件');
  const image = await loadBrowserImage(file);
  try {
    const sourceSize = Math.min(image.width, image.height);
    const sourceX = Math.max(0, Math.round((image.width - sourceSize) / 2));
    const sourceY = Math.max(0, Math.round((image.height - sourceSize) / 2));
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_DIMENSION;
    canvas.height = AVATAR_DIMENSION;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法处理头像，请换一台手机重试');
    context.drawImage(image.source, sourceX, sourceY, sourceSize, sourceSize, 0, 0, AVATAR_DIMENSION, AVATAR_DIMENSION);
    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const blob = await canvasBlob(canvas, quality);
      if (blob.size <= MAX_AVATAR_BYTES) return blob;
    }
  } finally {
    image.dispose();
  }
  throw new Error('头像仍然过大，请截图后重新上传');
}
