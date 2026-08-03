import { useState } from "react";
import { StickyNote } from "lucide-react";

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
import type { LoginInput } from "@/features/auth/types";

interface LoginFormProps {
  onSubmit: (input: LoginInput) => Promise<void>;
}

const noSuggestProps = {
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ username: username.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-svh flex items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted">
            <StickyNote className="size-5 text-foreground/70" />
          </div>
          <CardTitle className="text-lg">登录 MC Notes</CardTitle>
          <CardDescription>使用账号密码继续</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="login-username"
                className="text-xs text-muted-foreground"
              >
                用户名
              </label>
              <Input
                id="login-username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="test"
                autoComplete="username"
                autoFocus
                required
                {...noSuggestProps}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="login-password"
                className="text-xs text-muted-foreground"
              >
                密码
              </label>
              <Input
                id="login-password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                autoComplete="current-password"
                required
                {...noSuggestProps}
              />
            </div>
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="mt-4">
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "登录中…" : "登录"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
