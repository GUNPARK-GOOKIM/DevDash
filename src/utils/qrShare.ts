/**
 * QR helpers for encrypted connection share payloads.
 * Encode: qrcode · Decode: jsqr (image file / canvas).
 */
import QRCode from 'qrcode';
import jsQR from 'jsqr';

/** Practical upper bound for a scannable QR with moderate error correction. */
export const QR_MAX_PAYLOAD_CHARS = 2200;

export function canEncodeAsQr(payload: string): boolean {
  return payload.length > 0 && payload.length <= QR_MAX_PAYLOAD_CHARS;
}

/** Render payload as a PNG data URL QR code. */
export async function encodePayloadToQrDataUrl(payload: string): Promise<string> {
  if (!payload.trim()) {
    throw new Error('Cannot encode an empty payload as QR');
  }
  if (!canEncodeAsQr(payload)) {
    throw new Error(
      `Payload is too large for QR (${payload.length} chars; max ${QR_MAX_PAYLOAD_CHARS}). ` +
        'Copy the encrypted text instead, or share fewer connections.'
    );
  }
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 280,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

/** Decode the first QR found in an image File (PNG/JPEG/WebP). */
export async function decodeQrFromImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Select an image file that contains a QR code (PNG/JPEG).');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (!code?.data) {
      throw new Error('No QR code found in this image. Try a clearer crop or paste the text payload.');
    }
    return code.data.trim();
  } finally {
    bitmap.close();
  }
}

/** Decode QR from raw ImageData (camera frame). Returns null if none. */
export function decodeQrFromImageData(imageData: ImageData): string | null {
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  });
  return code?.data?.trim() || null;
}
