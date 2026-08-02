import type { Note, NoteInput } from "@/features/notes/types";

const API_BASE = "/api/notes";

type ApiEnvelope<T> = { data?: T; error?: string };

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await res.json()) as ApiEnvelope<T>;
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new Error(body?.error || `Request failed: ${res.status}`);
  }
  return (body?.data as T) ?? (null as unknown as T);
}

export function listNotes(): Promise<Note[]> {
  return request<Note[]>(API_BASE);
}

export function getNote(id: number): Promise<Note> {
  return request<Note>(`${API_BASE}/${id}`);
}

export function createNote(input: NoteInput): Promise<Note> {
  return request<Note>(API_BASE, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateNote(id: number, input: NoteInput): Promise<Note> {
  return request<Note>(`${API_BASE}/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteNote(id: number): Promise<null> {
  return request<null>(`${API_BASE}/${id}`, { method: "DELETE" });
}

export function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
