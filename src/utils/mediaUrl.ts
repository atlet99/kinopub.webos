export type FileUrls = {
  http?: string;
  hls?: string;
  hls2?: string;
  hls4?: string;
};

// ponytail: mirrors Android C5649M.m8716E — http→hls4 when no SSL, hls4→hls fallback
export function resolveFileUrl(file: { url?: string | FileUrls }, streamingType?: string, supportSsl = true): string {
  if (!file.url) {
    return '';
  }

  if (typeof file.url === 'string') {
    return file.url;
  }

  switch (streamingType) {
    case 'http':
      return (supportSsl ? file.url.http : file.url.hls4) || '';
    case 'hls':
      return file.url.hls || '';
    case 'hls2':
      return file.url.hls2 || '';
    case 'hls4':
      return file.url.hls4 || file.url.hls || '';
    default:
      return file.url.http || '';
  }
}

export function applyAc3Default(url: string, enabled?: boolean, streamingType?: string): string {
  if (!enabled || !url || streamingType !== 'hls4') {
    return url;
  }

  return `${url}${url.indexOf('?') > 0 ? '&' : '?'}ac3default=1`;
}
