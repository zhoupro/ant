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
};