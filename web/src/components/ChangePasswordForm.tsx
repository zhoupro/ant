import { useState } from "react";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ChangePasswordInput } from "@/features/auth/types";

interface ChangePasswordFormProps {
  username: string;
  onSubmit: (input: ChangePasswordInput) => Promise<void>;
}

const noSuggestProps = {
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

export function ChangePasswordForm({
  username,
  onSubmit,
}: ChangePasswordFormProps) {
  const [oldPassword, setOldPassword] = useState("");
  const [newUsername, setNewUsername] = useState(username);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = newUsername.trim();
  const nameInvalid =
    trimmedName.length > 0 && (trimmedName.length < 2 || trimmedName.length > 64);
  const mismatch = confirm.length > 0 && newPassword !== confirm;
  const tooShort = newPassword.length > 0 && newPassword.length < 6;
  const sameAsOld =
    oldPassword.length > 0 &&
    newPassword.length > 0 &&
    oldPassword === newPassword;
  const canSubmit =
    !submitting &&
    oldPassword.length > 0 &&
    trimmedName.length >= 2 &&
    trimmedName.length <= 64 &&
    newPassword.length >= 6 &&
    !mismatch &&
    !sameAsOld;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const payload: ChangePasswordInput = {
        old_password: oldPassword,
        new_password: newPassword,
      };
      if (trimmedName !== username) {
        payload.new_username = trimmedName;
      }
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失败");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-svh flex items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted">
            <KeyRound className="size-5 text-foreground/70" />
          </div>
          <CardTitle className="text-lg">修改密码</CardTitle>
          <CardDescription>
            {username}，首次登录需要修改密码
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="cp-username"
                className="text-xs text-muted-foreground"
              >
                用户名
              </label>
              <Input
                id="cp-username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder={username}
                aria-invalid={nameInvalid}
                autoComplete="username"
                required
                {...noSuggestProps}
              />
              {nameInvalid ? (
                <p className="text-xs text-destructive">
                  用户名长度需在 2~64 之间
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="cp-old"
                className="text-xs text-muted-foreground"
              >
                当前密码
              </label>
              <Input
                id="cp-old"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
                required
                {...noSuggestProps}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="cp-new"
                className="text-xs text-muted-foreground"
              >
                新密码（至少 6 位）
              </label>
              <Input
                id="cp-new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                aria-invalid={tooShort || sameAsOld}
                autoComplete="new-password"
                required
                {...noSuggestProps}
              />
              {sameAsOld ? (
                <p className="text-xs text-destructive">
                  新密码不能与当前密码相同
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="cp-confirm"
                className="text-xs text-muted-foreground"
              >
                确认新密码
              </label>
              <Input
                id="cp-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={mismatch}
                autoComplete="new-password"
                required
                {...noSuggestProps}
              />
              {mismatch ? (
                <p className="text-xs text-destructive">两次输入的新密码不一致</p>
              ) : null}
            </div>
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="mt-4">
            <Button
              type="submit"
              className="w-full"
              disabled={!canSubmit}
            >
              {submitting ? "提交中…" : "更新密码并进入"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
