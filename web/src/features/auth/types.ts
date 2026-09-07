export type UserKind = "admin" | "regular";

export interface AuthUser {
  id: number;
  username: string;
  user_kind: UserKind;
  is_super_admin: boolean;
  must_change_password: boolean;
  disabled?: boolean;
  permissions: string[];
  role_ids?: number[];
  created_at: string;
  updated_at: string;
}

export type LoginInput = { username: string; password: string };
export type ChangePasswordInput = {
  old_password: string;
  new_password: string;
  new_username?: string;
};

export interface APIToken {
  id: number;
  user_id: number;
  user_kind?: UserKind;
  name: string;
  prefix: string;
  expires_at?: string | null;
  last_used_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
}

export interface CreatedAPIToken {
  token: APIToken;
  plain: string;
}

export interface Role {
  id: number;
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  permission_ids: number[];
  created_at: string;
  updated_at: string;
}

export type PermissionCategory = "view" | "manage" | "admin";

export interface PermissionItem {
  id: number;
  code: string;
  name: string;
  description: string;
  category: PermissionCategory;
}

export interface ManagedUser {
  id: number;
  username: string;
  user_kind: UserKind;
  must_change_password: boolean;
  disabled?: boolean;
  role_ids: number[];
  role_names: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  role_ids: number[];
  must_change_password?: boolean;
  disabled?: boolean;
}

export interface UpdateUserInput {
  username?: string;
  role_ids?: number[];
  must_change_password?: boolean;
  disabled?: boolean;
}

export interface CreateRoleInput {
  code: string;
  name: string;
  description: string;
  permission_ids: number[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  permission_ids?: number[];
}

export interface CronJob {
  id: number;
  name: string;
  description?: string;
  cron_expr: string;
  command: string;
  enabled: boolean;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  last_run_at?: string | null;
  last_status?: string | null;
  next_run_at?: string | null;
}

export interface CronJobInput {
  name: string;
  description?: string;
  cron_expr: string;
  command: string;
  enabled?: boolean;
}

export interface CronJobRun {
  id: number;
  job_id: number;
  status: "running" | "success" | "failed" | "canceled";
  is_running?: boolean;
  trigger: "schedule" | "manual";
  exit_code?: number | null;
  error?: string;
  started_at: string;
  finished_at?: string | null;
  duration_ms: number;
  stdout_preview: string;
  stderr_preview: string;
  stdout_truncated: boolean;
  stderr_truncated: boolean;
  stdout_size: number;
  stderr_size: number;
  log_path: string;
  created_by?: string;
}

export interface CronJobRunList {
  runs: CronJobRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface CronJobLogSlice {
  content: string;
  offset: number;
  next: number;
  size: number;
  truncated: boolean;
  has_more: boolean;
}
