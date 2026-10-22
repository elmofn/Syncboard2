import type { Attachment } from '../types/api';

/** True quando o anexo é uma imagem (pelo contentType ou extensão do nome). */
export function isImageAttachment(a: Attachment): boolean {
  if (a?.contentType && a.contentType.toLowerCase().startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(a?.name || '');
}
