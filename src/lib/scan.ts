/** Hand-off between the scanner screen and the screen that opened it. */
let pending: { purpose: string; data: string } | null = null;

export function putScan(purpose: string, data: string): void {
  pending = { purpose, data };
}

export function takeScan(purpose: string): string | null {
  if (pending?.purpose !== purpose) return null;
  const { data } = pending;
  pending = null;
  return data;
}
