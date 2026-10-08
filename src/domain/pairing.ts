/** Link data of the QR shown in the portal (Distribución → Preventa móvil). */
export interface PairingData {
  server: string; // API base, e.g. https://distribuidora.aurum.com.ar/api/v1
  code: string;
}

/** Accepts the QR JSON ({"aurum":1,"server":...,"code":...}) or nothing else. */
export function parsePairingQr(text: string): PairingData | null {
  try {
    const data = JSON.parse(text) as { aurum?: number; server?: string; code?: string };
    if (data.aurum !== 1 || !data.server || !data.code) return null;
    const server = normalizeServer(data.server);
    return server ? { server, code: normalizeCode(data.code) } : null;
  } catch {
    return null;
  }
}

/** "distribuidora.com.ar" or "https://distribuidora.com.ar/" -> ".../api/v1". */
export function normalizeServer(text: string): string | null {
  let value = text.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    // A development server on the local network (IP or localhost) has no certificate.
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(value);
    value = `${local ? "http" : "https"}://${value}`;
  }
  value = value.replace(/\/+$/, "");
  if (!/\/api\/v1$/.test(value)) value = `${value}/api/v1`;
  try {
    new URL(value);
  } catch {
    return null;
  }
  return value;
}

/** Codes are typed as "DR42H-UG8GX": no dash, no spaces, upper case. */
export const normalizeCode = (text: string): string => text.replace(/[\s-]/g, "").toUpperCase();
