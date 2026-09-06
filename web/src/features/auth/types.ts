export interface User {
  id: number;
  username: string;
  must_change_password: boolean;
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