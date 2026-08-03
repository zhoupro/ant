import type { Note, NoteInput } from "@/features/notes/types";
import type {
  ChangePasswordInput,
  LoginInput,
  User,
} from "@/features/auth/types";

const API_BASE = "/api/notes";
const AUTH_BASE = "/api/auth";

type ApiEnvelope<T> = { data?: T; error?: string };

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
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

export function login(input: LoginInput): Promise<User> {
  return request<User>(`${AUTH_BASE}/login`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logout(): Promise<null> {
  return request<null>(`${AUTH_BASE}/logout`, { method: "POST" });
}

export function me(): Promise<User> {
  return request<User>(`${AUTH_BASE}/me`);
}

export function changePassword(input: ChangePasswordInput): Promise<User> {
  return request<User>(`${AUTH_BASE}/change-password`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
