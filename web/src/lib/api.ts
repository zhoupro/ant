import type {
  ChangePasswordInput,
  LoginInput,
  User,
} from "@/features/auth/types";

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

export interface Attachment {
  id: number;
  user_id: number;
  original_name: string;
  size: number;
  content_type: string;
  url: string;
  created_at: string;
}

export function listUploads(): Promise<Attachment[]> {
  return request<Attachment[]>("/api/uploads");
}

export async function uploadFile(file: File): Promise<Attachment> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/uploads", {
    method: "POST",
    body: fd,
    credentials: "same-origin",
  });
  let body: ApiEnvelope<Attachment> | null = null;
  try {
    body = (await res.json()) as ApiEnvelope<Attachment>;
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new Error(body?.error || `Upload failed: ${res.status}`);
  }
  if (!body?.data) {
    throw new Error("Upload response empty");
  }
  return body.data;
}

export function deleteUpload(id: number): Promise<null> {
  return request<null>(`/api/uploads/${id}`, { method: "DELETE" });
}

export interface Setting {
  key: string;
  value: string;
  updated_at?: string;
}

export function listSettings(): Promise<Setting[]> {
  return request<Setting[]>("/api/settings");
}

export function updateSetting(key: string, value: string): Promise<Setting> {
  return request<Setting>("/api/settings", {
    method: "PUT",
    body: JSON.stringify({ key, value }),
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

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const fixed = value >= 100 || i === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fixed)} ${units[i]}`;
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${window.location.origin}${path.startsWith("/") ? "" : "/"}${path}`;
}
