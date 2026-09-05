import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppShell, type HomeTab } from "@/components/AppShell";
import { Files } from "@/components/Files";
import { LoginForm } from "@/components/LoginForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Settings } from "@/components/Settings";
import { Dashboard } from "@/components/db/Dashboard";
import { ModelsList } from "@/components/logicmodels/ModelsList";
import { PagesList } from "@/components/pages/PagesList";
import { HomeView } from "@/components/pages/HomeView";
import {
  changePassword,
  login,
  logout as apiLogout,
  me,
} from "@/lib/api";
import type { User } from "@/features/auth/types";
import type { Page } from "@/features/pages/types";

type View =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "change-password"; user: User }
  | { kind: "home"; user: User };

export default function App() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [tab, setTab] = useState<HomeTab>("home");
  const [pendingModelSlug, setPendingModelSlug] = useState<string | null>(null);
  const [editingPage, setEditingPage] = useState<Page | null>(null);
  const [, setActivePageId] = useState<string | null>(null);

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
        {tab === "home" ? (
          <HomeView
            onGoToSettings={() => setTab("settings")}
            onEditPage={(p) => {
              setEditingPage(p);
              setTab("pages");
            }}
          />
        ) : tab === "files" ? (
          <Files />
        ) : tab === "settings" ? (
          <Settings />
        ) : tab === "models" ? (
          <ModelsList
            onGoToDB={() => setTab("db")}
            initialSlug={pendingModelSlug}
            onInitialSlugConsumed={() => setPendingModelSlug(null)}
          />
        ) : tab === "pages" ? (
          <Card className="w-full max-w-3xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">页面配置</CardTitle>
              <CardDescription>
                配置底部导航的页面,最多两级,每个页面关联一个逻辑模型,进入即展示其数据表格
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PagesList
                onOpenPage={(p) => {
                  setActivePageId(p.id);
                  setTab("home");
                }}
                initialEdit={editingPage}
                onEditConsumed={() => setEditingPage(null)}
              />
            </CardContent>
          </Card>
        ) : (
          <Dashboard
            onGoToSettings={() => setTab("settings")}
            onGoToModel={(slug) => {
              setPendingModelSlug(slug);
              setTab("models");
            }}
          />
        )}
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