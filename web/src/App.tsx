import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { AppShell, type HomeTab } from "@/components/AppShell";
import { Files } from "@/components/Files";
import { LoginForm } from "@/components/LoginForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Settings } from "@/components/Settings";
import {
  changePassword,
  login,
  logout as apiLogout,
  me,
} from "@/lib/api";
import type { User } from "@/features/auth/types";

type View =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "change-password"; user: User }
  | { kind: "home"; user: User };

export default function App() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [tab, setTab] = useState<HomeTab>("files");

  const checkAuth = useCallback(async () => {
    try {
      const user = await me();
      if (user.must_change_password) {
        setView({ kind: "change-password", user });
      } else {
        setView({ kind: "home", user });
      }
    } catch {
      setView({ kind: "login" });
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const handleLogout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      toast.error("退出登录失败");
    } finally {
      setView({ kind: "login" });
    }
  }, []);

  if (view.kind === "loading") {
    return <BootScreen />;
  }
  if (view.kind === "login") {
    return (
      <>
        <LoginForm
          onSubmit={async (input) => {
            const user = await login(input);
            if (user.must_change_password) {
              setView({ kind: "change-password", user });
            } else {
              setView({ kind: "home", user });
              toast.success(`欢迎回来，${user.username}`);
            }
          }}
        />
        <Toaster position="top-center" richColors />
      </>
    );
  }
  if (view.kind === "change-password") {
    return (
      <>
        <ChangePasswordForm
          username={view.user.username}
          onSubmit={async (input) => {
            const user = await changePassword(input);
            setView({ kind: "home", user });
            setTab("files");
            toast.success("密码已更新");
          }}
        />
        <Toaster position="top-center" richColors />
      </>
    );
  }

  return (
    <>
      <AppShell
        username={view.user.username}
        active={tab}
        onTabChange={setTab}
        onLogout={handleLogout}
      >
        {tab === "files" ? <Files /> : <Settings />}
      </AppShell>
      <Toaster position="top-center" richColors />
    </>
  );
}

function BootScreen() {
  return (
    <div className="min-h-svh flex items-center justify-center bg-background text-muted-foreground">
      <span className="text-sm">加载中…</span>
    </div>
  );
}
