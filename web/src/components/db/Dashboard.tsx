import { useCallback, useEffect, useState } from "react";
import {
  Database,
  LogOut,
  Plus,
  RefreshCw,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  dropTable,
  formatBytes,
  getDBStatus,
  listTables,
  unloadDB,
} from "@/lib/api";
import type { DBStatus } from "@/features/db/types";
import type { User } from "@/features/auth/types";

import { CreateTableDialog } from "./CreateTableDialog";
import { DBLoadPanel } from "./DBLoadPanel";
import { TableView } from "./TableView";

interface DashboardProps {
  user: User;
  onLogout: () => Promise<void> | void;
}

export function Dashboard({ user, onLogout }: DashboardProps) {
  const [status, setStatus] = useState<DBStatus | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const s = await getDBStatus();
      setStatus(s);
      if (!s.loaded) {
        setTables([]);
        setActive(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "获取数据库状态失败");
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const refreshTables = useCallback(async () => {
    setLoadingTables(true);
    try {
      const r = await listTables();
      setTables(r.tables);
      if (active && !r.tables.includes(active)) setActive(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "获取表列表失败");
    } finally {
      setLoadingTables(false);
    }
  }, [active]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (status?.loaded) void refreshTables();
  }, [status?.loaded, refreshTables]);

  const handleUnload = async () => {
    if (!confirm("卸载后不再管理该数据库,确定继续?")) return;
    await unloadDB();
    await refreshStatus();
    toast.success("已卸载");
  };

  const handleDropTable = async (name: string) => {
    if (!confirm(`确定删除表 "${name}" 吗?此操作不可恢复`)) return;
    try {
      await dropTable(name);
      toast.success(`已删除 ${name}`);
      if (active === name) setActive(null);
      await refreshTables();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const handleCreated = async () => {
    setCreateOpen(false);
    await refreshTables();
    toast.success("表已创建");
  };

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-foreground/70" />
          <span className="text-sm font-medium">MC Notes · 数据库管理</span>
          <span className="text-xs text-muted-foreground">
            {user.username}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refreshStatus();
              void refreshTables();
            }}
          >
            <RefreshCw className="size-3.5" />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => void onLogout()}>
            <LogOut className="size-3.5" />
            退出
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-3 border-b p-3 md:w-64 md:border-b-0 md:border-r">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">当前数据库</span>
              {status?.loaded ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => void handleUnload()}
                  aria-label="卸载"
                >
                  <X className="size-3" />
                </Button>
              ) : null}
            </div>
            {loadingStatus ? (
              <div className="mt-2 text-muted-foreground">加载中…</div>
            ) : status?.loaded ? (
              <div className="mt-2 space-y-0.5">
                <div className="truncate font-medium" title={status.path}>
                  {status.name}
                </div>
                <div className="text-muted-foreground">
                  {formatBytes(status.size)} · {status.tables} 表
                </div>
              </div>
            ) : (
              <div className="mt-2 text-muted-foreground">未加载</div>
            )}
          </div>

          <Separator />

          {status?.loaded ? (
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">表</span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="size-3" />
                  新建表
                </Button>
              </div>
              <div className="-mx-1 flex-1 overflow-auto pr-1">
                {loadingTables ? (
                  <div className="px-1 py-2 text-xs text-muted-foreground">
                    加载中…
                  </div>
                ) : tables.length === 0 ? (
                  <div className="px-1 py-2 text-xs text-muted-foreground">
                    暂无表
                  </div>
                ) : (
                  <ul className="space-y-0.5">
                    {tables.map((t) => (
                      <li
                        key={t}
                        className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted ${active === t ? "bg-muted" : ""}`}
                      >
                        <button
                          type="button"
                          className="flex flex-1 items-center gap-1.5 truncate text-left"
                          onClick={() => setActive(t)}
                        >
                          <Table2 className="size-3.5 text-muted-foreground" />
                          <span className="truncate">{t}</span>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => void handleDropTable(t)}
                          aria-label="删除表"
                        >
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </aside>

        <main className="flex-1 overflow-auto p-4">
          {!status?.loaded ? (
            <div className="flex h-full items-center justify-center">
              <DBLoadPanel onLoaded={() => void refreshStatus()} />
            </div>
          ) : active ? (
            <TableView
              tableName={active}
              onMutated={() => void refreshTables()}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              请选择左侧的表,或点击「新建表」开始管理数据
            </div>
          )}
        </main>
      </div>

      <CreateTableDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreated}
      />
    </div>
  );
}