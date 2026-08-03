import { LogOut, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/api";
import type { User } from "@/features/auth/types";

interface WelcomeProps {
  user: User;
  onLogout: () => Promise<void> | void;
}

export function Welcome({ user, onLogout }: WelcomeProps) {
  return (
    <div className="min-h-svh flex items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted">
            <Sparkles className="size-5 text-foreground/70" />
          </div>
          <CardTitle className="text-lg">欢迎，{user.username}</CardTitle>
          <CardDescription>登录成功，欢迎回来</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">账号</dt>
            <dd className="font-medium">{user.username}</dd>
            <dt className="text-muted-foreground">用户 ID</dt>
            <dd className="font-mono text-xs">#{user.id}</dd>
            <dt className="text-muted-foreground">创建时间</dt>
            <dd>{formatDateTime(user.created_at)}</dd>
            <dt className="text-muted-foreground">上次更新</dt>
            <dd>{formatDateTime(user.updated_at)}</dd>
          </dl>
          <Separator />
          <p className="text-xs text-muted-foreground">
            会话基于 HttpOnly Cookie，过期前会一直保持登录。
          </p>
        </CardContent>
        <CardFooter className="mt-4 flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => void onLogout()}
          >
            <LogOut className="size-3.5" />
            退出登录
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
