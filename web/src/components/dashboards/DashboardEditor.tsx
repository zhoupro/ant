import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  createDashboardCard,
  deleteDashboardCard,
  getDashboard,
  updateDashboardCard,
} from "@/lib/api";
import type {
  DashboardCard,
  DashboardDetail,
} from "@/features/dashboards/types";
import { CardEditorDialog } from "./CardEditorDialog";
import { DashboardView } from "./DashboardView";
import { cn } from "@/lib/utils";

interface DashboardEditorProps {
  dashboardId: string;
  onBack: () => void;
}

type Mode =
  | { kind: "idle" }
  | { kind: "create" }
  | { kind: "edit"; card: DashboardCard };

// DashboardEditor 是统计中心的「单页编辑器」:
// 顶部是元信息(标题 + 返回),下方并列「卡片列表」与「实时预览」。
// 预览就是 DashboardView 本身 —— 同一份组件既服务生产,也服务编辑态。
export function DashboardEditor({ dashboardId, onBack }: DashboardEditorProps) {
  const [detail, setDetail] = useState<DashboardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [previewKey, setPreviewKey] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getDashboard(dashboardId);
      setDetail(d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading || !detail) {
    return (
      <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
        <Loader2 className="mr-1 size-3 animate-spin" /> 加载中…
      </div>
    );
  }

  const cards = detail.cards ?? [];
  const editing = mode.kind === "edit" ? mode.card : null;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between border-b border-border/60 pb-2">
        <div className="flex items-center gap-2">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onBack}
            aria-label="返回"
            title="返回"
          >
            <ArrowLeft className="size-3.5" />
          </Button>
          <h3 className="text-sm font-semibold">{detail.dashboard.label}</h3>
          <span className="font-mono text-xs text-muted-foreground">
            /{detail.dashboard.slug}
          </span>
        </div>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setMode({ kind: "create" })}
        >
          <Plus className="size-3" />
          新增卡片
        </Button>
      </header>

      <section className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground">
          卡片(共 {cards.length})
        </h4>
        {cards.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-xs text-muted-foreground">
            还没有任何卡片。点右上「新增卡片」创建一张。
          </p>
        ) : (
          <ul className="space-y-1">
            {cards.map((c) => (
              <li key={c.id}>
                <CardRow
                  card={c}
                  onEdit={() => setMode({ kind: "edit", card: c })}
                  onDelete={async () => {
                    if (!confirm(`删除卡片「${c.title}」吗?`)) return;
                    try {
                      await deleteDashboardCard(
                        detail.dashboard.id,
                        c.id,
                      );
                      toast.success("已删除");
                      await refresh();
                      setPreviewKey((k) => k + 1);
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "删除失败",
                      );
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-muted-foreground">
            实时预览
          </h4>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setPreviewKey((k) => k + 1)}
          >
            重新执行
          </button>
        </div>
        <DashboardView key={previewKey} detail={detail} />
      </section>

      {mode.kind !== "idle" && (
        <CardEditorDialog
          open
          dashboardId={detail.dashboard.id}
          initial={editing}
          onClose={() => setMode({ kind: "idle" })}
          onSaved={async (input) => {
            try {
              if (editing) {
                await updateDashboardCard(
                  detail.dashboard.id,
                  editing.id,
                  input,
                );
                toast.success("卡片已保存");
              } else {
                await createDashboardCard(detail.dashboard.id, input);
                toast.success("卡片已创建");
              }
              setMode({ kind: "idle" });
              await refresh();
              setPreviewKey((k) => k + 1);
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "保存失败",
              );
            }
          }}
        />
      )}
    </div>
  );
}

interface CardRowProps {
  card: DashboardCard;
  onEdit: () => void;
  onDelete: () => void;
}

function CardRow({ card, onEdit, onDelete }: CardRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate">{card.title}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {card.kind === "line_chart" ? "折线图" : "数字 / 表格"}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onEdit}
          aria-label="编辑卡片"
          title="编辑卡片"
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onDelete}
          aria-label="删除卡片"
          title="删除卡片"
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}