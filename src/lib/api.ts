import Constants from "expo-constants";

export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";
const TIMEOUT_MS = 20_000;

/** The server answered with an error (validation, revoked device...). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** No answer: no signal, server down or timeout. The data stays on the phone. */
export class OfflineError extends Error {
  constructor() {
    super("Sin conexión con el servidor");
  }
}

export async function request<T>(server: string, path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${server}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        "X-App-Version": APP_VERSION,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new OfflineError();
  } finally {
    clearTimeout(timer);
  }
  if (response.status >= 500) throw new OfflineError();
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = data?.error ?? {};
    throw new ApiError(response.status, error.code ?? "ERROR", error.message ?? `Error ${response.status}`);
  }
  return data as T;
}

/** The phone was unlinked in the portal: it must be paired again. */
export const isRevoked = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 401;
