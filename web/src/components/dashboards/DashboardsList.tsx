import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  createDashboard,
  deleteDashboard,
  listDashboardIcons,
  listDashboards,
  updateDashboard,
} from "@/lib/api";
import type {
  Dashboard,
  DashboardInput,
} from "@/features/dashboards/types";
import {
  decodeDashboardConfig,
  encodeDashboardConfig,
} from "@/features/dashboards/types";
import { DashboardEditor } from "./DashboardEditor";
import { cn } from "@/lib/utils";

interface DashboardsListProps {
  onOpenDashboard?: (d: Dashboard) => void;
}

export function DashboardsList({ onOpenDashboard }: DashboardsListProps) {
  const [items, setItems] = useState<Dashboard[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Dashboard | null>(null);
  const [creating, setCreating] = useState(false);
  const [icons, setIcons] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, iconList] = await Promise.all([
        listDashboards(),
        listDashboardIcons(),
      ]);
      setItems(list);
      setIcons(iconList);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onDelete = async (id: string, label: string) => {
    if (!confirm(`删除统计中心「${label}」吗?所有卡片会一并删除`)) return;
    try {
      await deleteDashboard(id);
      toast.success("已删除");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const isEmpty = !loading && (items?.length ?? 0) === 0;

  if (activeId) {
    return (
      <DashboardEditor
        dashboardId={activeId}
        onBack={() => {
          setActiveId(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Layers className="size-3.5" />
          统计中心
        </span>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setCreating(true)}
        >
          <Plus className="size-3" />
          新建统计中心
        </Button>
      </div>

      {loading ? (
        <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-8 text-center text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline size-3 animate-spin" /> 加载中…
        </p>
      ) : isEmpty ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-8 text-center">
          <Sparkles className="mx-auto mb-2 size-5 text-muted-foreground" />
          <p className="text-xs font-medium">还没有配置任何统计中心</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            统计中心由若干张「卡片」组成,每张卡片执行一条 SQL。
            把统计中心挂到页面上,即可在首页展示。
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {items!.map((d) => (
            <li key={d.id}>
              <DashboardRow
                dashboard={d}
                onOpen={() => {
                  setActiveId(d.id);
                  onOpenDashboard?.(d);
                }}
                onEdit={() => setEditing(d)}
                onDelete={() => void onDelete(d.id, d.label)}
              />
            </li>
          ))}
        </ul>
      )}

      {(editing || creating) && (
        <DashboardEditorDialog
          open
          initial={editing}
          icons={icons}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

interface DashboardRowProps {
  dashboard: Dashboard;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function DashboardRow({
  dashboard,
  onOpen,
  onEdit,
  onDelete,
}: DashboardRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        title="进入统计中心"
      >
        <span className="font-mono text-xs text-muted-foreground">
          /{dashboard.slug}
        </span>
        <span className="truncate">{dashboard.label}</span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onEdit}
          aria-label="编辑统计中心"
          title="编辑统计中心"
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => onOpen()}
          aria-label="管理卡片"
          title="管理卡片"
        >
          <ArrowLeft className="size-3.5 rotate-180" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onDelete}
          aria-label="删除统计中心"
          title="删除统计中心"
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

interface DashboardEditorDialogProps {
  open: boolean;
  initial: Dashboard | null;
  icons: string[];
  onClose: () => void;
  onSaved: () => void;
}

function DashboardEditorDialog({
  open,
  initial,
  icons,
  onClose,
  onSaved,
}: DashboardEditorDialogProps) {
  const isEdit = !!initial;
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [icon, setIcon] = useState(initial?.icon || "BarChart");
  const [sort, setSort] = useState<string>(
    initial?.sort != null ? String(initial.sort) : "0",
  );
  const initialCfg = initial ? decodeDashboardConfig(initial.config) : {};
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(
    (initialCfg.refresh_seconds ?? 0) > 0,
  );
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState<string>(
    initialCfg.refresh_seconds && initialCfg.refresh_seconds > 0
      ? String(initialCfg.refresh_seconds)
      : "30",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSlug(initial?.slug ?? "");
    setLabel(initial?.label ?? "");
    setIcon(initial?.icon || "BarChart");
    setSort(initial?.sort != null ? String(initial.sort) : "0");
    const cfg = initial ? decodeDashboardConfig(initial.config) : {};
    setAutoRefreshEnabled((cfg.refresh_seconds ?? 0) > 0);
    setAutoRefreshSeconds(
      cfg.refresh_seconds && cfg.refresh_seconds > 0
        ? String(cfg.refresh_seconds)
        : "30",
    );
    setError(null);
  }, [open, initial]);

  const submit = async () => {
    setError(null);
    if (!/^[a-z][a-z0-9_-]*$/.test(slug)) {
      setError("slug 必须以小写字母开头,只能包含小写字母、数字、下划线、连字符");
      return;
    }
    if (!label.trim()) {
      setError("展示名不能为空");
      return;
    }
    let refreshSeconds = 0;
    if (autoRefreshEnabled) {
      const n = Number.parseInt(autoRefreshSeconds, 10);
      if (!Number.isFinite(n) || n < 1) {
        setError("自动刷新秒数必须是正整数");
        return;
      }
      refreshSeconds = n;
    }
    setSubmitting(true);
    try {
      const input: DashboardInput = {
        slug: slug.trim(),
        label: label.trim(),
        icon,
        sort: Number(sort) || 0,
        config: encodeDashboardConfig({ refresh_seconds: refreshSeconds }),
      };
      if (isEdit && initial) {
        await updateDashboard(initial.id, input);
      } else {
        await createDashboard(input);
      }
      toast.success(isEdit ? "已保存" : "已新建");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-medium">
        {isEdit ? "编辑统计中心" : "新建统计中心"}
      </h3>
      <p className="mt-1 text-[11px] text-muted-foreground">
        统计中心是若干张卡片的容器,新建后再为其添加卡片。
      </p>
      <div className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="weather"
              className="h-8 w-full rounded-lg border bg-transparent px-2 font-mono text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">展示名</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="天气与销量"
              className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">图标</label>
            <div className="grid grid-cols-8 gap-1 rounded-md border bg-muted/20 p-2">
              {icons.map((name) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => setIcon(name)}
                  className={cn(
                    "flex h-8 w-full items-center justify-center rounded text-[10px] font-mono",
                    icon === name
                      ? "bg-foreground text-background"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  {name.slice(0, 4)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">排序</label>
            <input
              type="number"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1 rounded-md border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">运行时自动刷新</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                打开后,聚合页会按设定的秒数自动重新执行所有卡片 SQL。0 / 关闭 = 不自动刷新。
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
                className="size-3.5 accent-foreground"
              />
              启用
            </label>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <label className="text-xs text-muted-foreground">间隔秒数</label>
            <input
              type="number"
              min={1}
              step={1}
              value={autoRefreshSeconds}
              onChange={(e) => setAutoRefreshSeconds(e.target.value)}
              disabled={!autoRefreshEnabled}
              className="h-7 w-20 rounded border bg-transparent px-2 text-xs disabled:opacity-50"
            />
            <span className="text-[11px] text-muted-foreground">秒</span>
          </div>
        </div>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={submitting} onClick={() => void submit()}>
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}