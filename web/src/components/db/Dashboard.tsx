import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Table2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  autoCreateModel,
  createTable,
  dropTable,
  formatBytes,
  getDBStatus,
  listTables,
} from "@/lib/api";
import type { CreateTableInput, DBStatus } from "@/features/db/types";

import { CreateTableDialog } from "./CreateTableDialog";
import { DBLoadPanel } from "./DBLoadPanel";
import { ModelRuntime } from "@/components/logicmodels/ModelRuntime";

interface DashboardProps {
  onGoToSettings: () => void;
  onGoToModel: (slug: string) => void;
}

export function Dashboard({ onGoToSettings, onGoToModel }: DashboardProps) {
  const [status, setStatus] = useState<DBStatus | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [loadingRuntime, setLoadingRuntime] = useState(false);

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
      if (activeSlug && !r.tables.includes(activeSlug.split("auto_")[1])) {
        // keep the activeSlug if the table still exists
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "获取表列表失败");
    } finally {
      setLoadingTables(false);
    }
  }, [active, activeSlug]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (status?.loaded) void refreshTables();
  }, [status?.loaded, refreshTables]);

  const handleDropTable = async (name: string) => {
    if (!confirm(`确定删除表 "${name}" 吗?此操作不可恢复`)) return;
    try {
      await dropTable(name);
      try {
        await fetch(
          `/api/models/${encodeURIComponent(`auto_${name}`)}`,
          { method: "DELETE", credentials: "same-origin" },
        );
      } catch {
        // ignore — model may not exist
      }
      toast.success(`已删除 ${name}`);
      if (active === name) {
        setActive(null);
        setActiveSlug(null);
      }
      await refreshTables();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const handleCreated = async (input: CreateTableInput) => {
    await createTable(input);
    setCreateOpen(false);
    await refreshTables();
    toast.success("表已创建,CRUD 接口已就绪");
    try {
      await autoCreateModel({ physical: input.name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "默认模型生成失败");
    }
  };

  const handleSelectTable = async (name: string) => {
    setActive(name);
    setLoadingRuntime(true);
    try {
      const row = await autoCreateModel({ physical: name });
      setActiveSlug(row.slug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoadingRuntime(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col bg-background md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-3 border-b p-3 md:w-64 md:border-b-0 md:border-r">
        <div className="rounded-lg border bg-muted/30 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">当前数据库</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                void refreshStatus();
                void refreshTables();
              }}
              aria-label="刷新"
            >
              <RefreshCw className="size-3" />
            </Button>
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
              <div className="truncate text-muted-foreground/80" title={status.path}>
                {status.path}
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
                        onClick={() => void handleSelectTable(t)}
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
            <DBLoadPanel onGoToSettings={onGoToSettings} />
          </div>
        ) : active && activeSlug ? (
          <ModelRuntime
            slug={activeSlug}
            onBack={() => {
              setActive(null);
              setActiveSlug(null);
            }}
            onEdit={() => {
              if (activeSlug) onGoToModel(activeSlug);
            }}
            onDeleted={() => {
              setActive(null);
              setActiveSlug(null);
            }}
          />
        ) : active && loadingRuntime ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            正在生成默认 CRUD 接口...
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            请选择左侧的表,或点击「新建表」开始管理数据
          </div>
        )}
      </main>

      <CreateTableDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreated}
      />
    </div>
  );
}