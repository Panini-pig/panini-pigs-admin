const KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomPart(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => KEY_CHARS[b % KEY_CHARS.length])
    .join("");
}

export function generateLicenseKey(): string {
  return `DY-${randomPart(4)}-${randomPart(4)}-${randomPart(4)}`;
}

export function generateToken(): string {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}
