export function formatJsonOrNull(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return null;
  }
}
