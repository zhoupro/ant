import type {
  APIToken,
  AuthUser,
  ChangePasswordInput,
  CreateRoleInput,
  CreateUserInput,
  CreatedAPIToken,
  CronJob,
  CronJobInput,
  CronJobLogSlice,
  CronJobRun,
  CronJobRunList,
  LoginInput,
  ManagedUser,
  PermissionItem,
  Role,
  UpdateRoleInput,
  UpdateUserInput,
} from "@/features/auth/types";
import type {
  AddColumnInput,
  Column,
  CreateTableInput,
  DBStatus,
  RowInput,
  RowsResponse,
} from "@/features/db/types";
import type {
  BusinessTypeInfo,
  ModelConfig,
  ModelRecord,
  ModelSummary,
  PhysicalTable,
  RowDetail,
  RowMutationInput,
  RuntimeRowResponse,
  RuntimeSchema,
} from "@/features/logicmodels/types";
import type { Page, PageInput } from "@/features/pages/types";
import type {
  CreateLogInput,
  LogEntry,
  LogFacets,
  LogLevel,
  LogListResponse,
} from "@/features/logs/types";

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

export function login(input: LoginInput): Promise<AuthUser> {
  return request<AuthUser>(`${AUTH_BASE}/login`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logout(): Promise<null> {
  return request<null>(`${AUTH_BASE}/logout`, { method: "POST" });
}

export function me(): Promise<AuthUser> {
  return request<AuthUser>(`${AUTH_BASE}/me`);
}

export function changePassword(input: ChangePasswordInput): Promise<AuthUser> {
  return request<AuthUser>(`${AUTH_BASE}/change-password`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listAPITokens(): Promise<APIToken[]> {
  return request<APIToken[]>(`${AUTH_BASE}/tokens`);
}

export function createAPIToken(input: {
  name?: string;
  expires_in_days?: number;
}): Promise<CreatedAPIToken> {
  return request<CreatedAPIToken>(`${AUTH_BASE}/tokens`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revokeAPIToken(id: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `${AUTH_BASE}/tokens/${encodeURIComponent(String(id))}`,
    { method: "DELETE" },
  );
}

export function revealAPIToken(
  id: number,
): Promise<{ plain: string; revoked: boolean; expired: boolean }> {
  return request<{ plain: string; revoked: boolean; expired: boolean }>(
    `${AUTH_BASE}/tokens/${encodeURIComponent(String(id))}/plain`,
  );
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

export function dropColumn(name: string, column: string): Promise<unknown> {
  return request(
    `${TABLES_BASE}/${encodeURIComponent(name)}/columns/${encodeURIComponent(column)}`,
    { method: "DELETE" },
  );
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

const MODELS_BASE = "/api/models";

export function listModels(): Promise<ModelSummary[]> {
  return request<ModelSummary[]>(MODELS_BASE);
}

export function getModel(slug: string): Promise<ModelRecord> {
  return request<ModelRecord>(`${MODELS_BASE}/${encodeURIComponent(slug)}`);
}

export function saveModel(input: {
  slug: string;
  label: string;
  description: string;
  config: ModelConfig;
}): Promise<ModelRecord> {
  return request<ModelRecord>(
    `${MODELS_BASE}/${encodeURIComponent(input.slug)}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function autoCreateModel(input: {
  physical: string;
  slug?: string;
  label?: string;
}): Promise<ModelRecord> {
  return request<ModelRecord>(`${MODELS_BASE}/auto`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteModel(slug: string): Promise<null> {
  return request<null>(`${MODELS_BASE}/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

export function listModelTables(): Promise<{ tables: PhysicalTable[] }> {
  return request<{ tables: PhysicalTable[] }>(`${MODELS_BASE}/tables`);
}

export function getModelTableSchema(
  name: string,
): Promise<PhysicalTable> {
  return request<PhysicalTable>(
    `${MODELS_BASE}/tables/${encodeURIComponent(name)}/schema`,
  );
}

export function listBusinessTypes(): Promise<BusinessTypeInfo[]> {
  return request<BusinessTypeInfo[]>(`${MODELS_BASE}/business-types`);
}

const RUNTIME_BASE = "/api/runtime";

export function getRuntimeSchema(slug: string): Promise<RuntimeSchema> {
  return request<RuntimeSchema>(
    `${RUNTIME_BASE}/${encodeURIComponent(slug)}/schema`,
  );
}

export function listRuntimeRows(
  slug: string,
  opts: {
    limit?: number;
    offset?: number;
    search?: string;
    sort?: string;
    order?: "asc" | "desc";
    filters?: Record<string, string>;
  } = {},
): Promise<RuntimeRowResponse> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  if (opts.search) params.set("search", opts.search);
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.order) params.set("order", opts.order);
  if (opts.filters) {
    for (const [k, v] of Object.entries(opts.filters)) {
      if (v) params.set(`filter[${k}]`, v);
    }
  }
  const qs = params.toString();
  return request<RuntimeRowResponse>(
    `${RUNTIME_BASE}/${encodeURIComponent(slug)}/rows${qs ? `?${qs}` : ""}`,
  );
}

export function getRuntimeRow(
  slug: string,
  id: string | number,
): Promise<RowDetail> {
  return request<RowDetail>(
    `${RUNTIME_BASE}/${encodeURIComponent(slug)}/rows/${encodeURIComponent(String(id))}`,
  );
}

export function createRuntimeRow(
  slug: string,
  input: RowMutationInput,
): Promise<unknown> {
  return request(`${RUNTIME_BASE}/${encodeURIComponent(slug)}/rows`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRuntimeRow(
  slug: string,
  id: string | number,
  input: RowMutationInput,
): Promise<unknown> {
  return request(
    `${RUNTIME_BASE}/${encodeURIComponent(slug)}/rows/${encodeURIComponent(String(id))}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function deleteRuntimeRow(
  slug: string,
  id: string | number,
): Promise<unknown> {
  return request(
    `${RUNTIME_BASE}/${encodeURIComponent(slug)}/rows/${encodeURIComponent(String(id))}`,
    { method: "DELETE" },
  );
}

export function generateSlug(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `model_${Date.now().toString(36)}_${rnd}`;
}

const PAGES_BASE = "/api/pages";

export function listPages(): Promise<Page[]> {
  return request<Page[]>(PAGES_BASE);
}

export function getPage(id: string): Promise<Page> {
  return request<Page>(`${PAGES_BASE}/${encodeURIComponent(id)}`);
}

export function createPage(input: PageInput): Promise<Page> {
  return request<Page>(PAGES_BASE, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePage(id: string, input: PageInput): Promise<Page> {
  return request<Page>(`${PAGES_BASE}/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deletePage(
  id: string,
): Promise<{ ok: boolean; id: string }> {
  return request<{ ok: boolean; id: string }>(
    `${PAGES_BASE}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function listPageIcons(): Promise<string[]> {
  return request<string[]>(`${PAGES_BASE}/icons`);
}

const LOGS_BASE = "/api/logs";

export interface ListLogsOptions {
  level?: LogLevel;
  source?: string;
  search?: string;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
}

export function listLogs(
  opts: ListLogsOptions = {},
): Promise<LogListResponse> {
  const params = new URLSearchParams();
  if (opts.level) params.set("level", opts.level);
  if (opts.source) params.set("source", opts.source);
  if (opts.search) params.set("search", opts.search);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  if (opts.order) params.set("order", opts.order);
  const qs = params.toString();
  return request<LogListResponse>(
    `${LOGS_BASE}${qs ? `?${qs}` : ""}`,
  );
}

export function getLog(id: number): Promise<LogEntry> {
  return request<LogEntry>(`${LOGS_BASE}/${encodeURIComponent(String(id))}`);
}

export function createLog(input: CreateLogInput): Promise<LogEntry> {
  return request<LogEntry>(LOGS_BASE, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteLog(id: number): Promise<{ ok: boolean; id: string }> {
  return request<{ ok: boolean; id: string }>(
    `${LOGS_BASE}/${encodeURIComponent(String(id))}`,
    { method: "DELETE" },
  );
}

export function clearLogs(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(LOGS_BASE, { method: "DELETE" });
}

export function getLogFacets(): Promise<LogFacets> {
  return request<LogFacets>(`${LOGS_BASE}/facets`);
}

const ADMIN_USERS_BASE = "/api/admin-users";

export function listAdminUsers(): Promise<ManagedUser[]> {
  return request<ManagedUser[]>(ADMIN_USERS_BASE);
}

export function createAdminUser(input: CreateUserInput): Promise<ManagedUser> {
  return request<ManagedUser>(ADMIN_USERS_BASE, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAdminUser(
  id: number,
  input: UpdateUserInput,
): Promise<ManagedUser> {
  return request<ManagedUser>(`${ADMIN_USERS_BASE}/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteAdminUser(id: number): Promise<{ ok: boolean; id: number }> {
  return request<{ ok: boolean; id: number }>(
    `${ADMIN_USERS_BASE}/${id}`,
    { method: "DELETE" },
  );
}

export function resetAdminUserPassword(
  id: number,
  password: string,
): Promise<{ ok: boolean; id: number }> {
  return request<{ ok: boolean; id: number }>(
    `${ADMIN_USERS_BASE}/${id}/reset-password`,
    { method: "POST", body: JSON.stringify({ password }) },
  );
}

const REGULAR_USERS_BASE = "/api/regular-users";

export function listRegularUsers(): Promise<ManagedUser[]> {
  return request<ManagedUser[]>(REGULAR_USERS_BASE);
}

export function createRegularUser(
  input: CreateUserInput,
): Promise<ManagedUser> {
  return request<ManagedUser>(REGULAR_USERS_BASE, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRegularUser(
  id: number,
  input: UpdateUserInput,
): Promise<ManagedUser> {
  return request<ManagedUser>(`${REGULAR_USERS_BASE}/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteRegularUser(
  id: number,
): Promise<{ ok: boolean; id: number }> {
  return request<{ ok: boolean; id: number }>(
    `${REGULAR_USERS_BASE}/${id}`,
    { method: "DELETE" },
  );
}

export function resetRegularUserPassword(
  id: number,
  password: string,
): Promise<{ ok: boolean; id: number }> {
  return request<{ ok: boolean; id: number }>(
    `${REGULAR_USERS_BASE}/${id}/reset-password`,
    { method: "POST", body: JSON.stringify({ password }) },
  );
}

const ROLES_BASE = "/api/roles";

export function listRoles(): Promise<Role[]> {
  return request<Role[]>(ROLES_BASE);
}

export function createRole(input: CreateRoleInput): Promise<Role> {
  return request<Role>(ROLES_BASE, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRole(
  id: number,
  input: UpdateRoleInput,
): Promise<Role> {
  return request<Role>(`${ROLES_BASE}/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteRole(id: number): Promise<{ ok: boolean; id: number }> {
  return request<{ ok: boolean; id: number }>(
    `${ROLES_BASE}/${id}`,
    { method: "DELETE" },
  );
}

export function listPermissions(): Promise<PermissionItem[]> {
  return request<PermissionItem[]>("/api/permissions");
}

export function hasPermission(
  user: { permissions: string[]; is_super_admin: boolean } | null | undefined,
  code: string,
): boolean {
  if (!user) return false;
  if (user.is_super_admin) return true;
  return user.permissions.includes(code);
}

const CRON_BASE = "/api/cronjobs";

export function listCronJobs(): Promise<CronJob[]> {
  return request<CronJob[]>(CRON_BASE);
}

export function getCronJob(id: number): Promise<CronJob> {
  return request<CronJob>(`${CRON_BASE}/${id}`);
}

export function createCronJob(input: CronJobInput): Promise<CronJob> {
  return request<CronJob>(CRON_BASE, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCronJob(id: number, input: CronJobInput): Promise<CronJob> {
  return request<CronJob>(`${CRON_BASE}/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteCronJob(id: number): Promise<{ ok: boolean; id: number }> {
  return request<{ ok: boolean; id: number }>(`${CRON_BASE}/${id}`, {
    method: "DELETE",
  });
}

export function toggleCronJob(id: number, enabled: boolean): Promise<CronJob> {
  return request<CronJob>(`${CRON_BASE}/${id}/toggle`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export function runCronJob(id: number): Promise<{ run_id: number }> {
  return request<{ run_id: number }>(`${CRON_BASE}/${id}/run`, {
    method: "POST",
  });
}

export function cancelCronRun(
  id: number,
  runId: number,
): Promise<{ ok: boolean; already_finished?: boolean }> {
  return request<{ ok: boolean; already_finished?: boolean }>(
    `${CRON_BASE}/${id}/runs/${runId}/cancel`,
    { method: "POST" },
  );
}

export function listCronRuns(
  id: number,
  opts: { limit?: number; offset?: number } = {},
): Promise<CronJobRunList> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return request<CronJobRunList>(
    `${CRON_BASE}/${id}/runs${qs ? `?${qs}` : ""}`,
  );
}

export function getCronRun(id: number, runId: number): Promise<CronJobRun> {
  return request<CronJobRun>(`${CRON_BASE}/${id}/runs/${runId}`);
}

export function readCronRunLog(
  id: number,
  runId: number,
  opts: { offset?: number; limit?: number } = {},
): Promise<CronJobLogSlice> {
  const params = new URLSearchParams();
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return request<CronJobLogSlice>(
    `${CRON_BASE}/${id}/runs/${runId}/log${qs ? `?${qs}` : ""}`,
  );
}