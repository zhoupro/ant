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
