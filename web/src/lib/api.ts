import type {
  ChangePasswordInput,
  LoginInput,
  User,
} from "@/features/auth/types";
import type {
  AddColumnInput,
  Column,
  CreateTableInput,
  DBStatus,
  RowInput,
  RowsResponse,
} from "@/features/db/types";

const AUTH_BASE = "/api/auth";
const DB_BASE = "/api/dbfile";
const TABLES_BASE = "/api/tables";

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

export function getDBStatus(): Promise<DBStatus> {
  return request<DBStatus>(`${DB_BASE}/status`);
}

export function listTables(): Promise<{ tables: string[] }> {
  return request<{ tables: string[] }>(`${TABLES_BASE}`);
}

export function getTableSchema(
  name: string
): Promise<{ name: string; columns: Column[]; primary_keys: string[] }> {
  return request(`${TABLES_BASE}/${encodeURIComponent(name)}/schema`);
}

export function listRows(
  name: string,
  opts: { limit?: number; offset?: number; search?: string } = {}
): Promise<RowsResponse> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  if (opts.search !== undefined && opts.search !== "")
    params.set("search", opts.search);
  const qs = params.toString();
  return request<RowsResponse>(
    `${TABLES_BASE}/${encodeURIComponent(name)}/rows${qs ? `?${qs}` : ""}`
  );
}

export function insertRow(name: string, input: RowInput): Promise<unknown> {
  return request(`${TABLES_BASE}/${encodeURIComponent(name)}/rows`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRow(
  name: string,
  pk: string,
  input: RowInput
): Promise<unknown> {
  return request(
    `${TABLES_BASE}/${encodeURIComponent(name)}/rows/${encodeURIComponent(pk)}`,
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export function deleteRow(name: string, pk: string): Promise<unknown> {
  return request(
    `${TABLES_BASE}/${encodeURIComponent(name)}/rows/${encodeURIComponent(pk)}`,
    { method: "DELETE" }
  );
}

export function createTable(input: CreateTableInput): Promise<unknown> {
  return request(`${TABLES_BASE}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function dropTable(name: string): Promise<unknown> {
  return request(`${TABLES_BASE}/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export function addColumn(
  name: string,
  input: AddColumnInput
): Promise<unknown> {
  return request(`${TABLES_BASE}/${encodeURIComponent(name)}/columns`, {
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

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${window.location.origin}${path.startsWith("/") ? "" : "/"}${path}`;
}