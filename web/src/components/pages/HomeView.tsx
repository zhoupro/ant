import { useCallback, useEffect, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { listPages } from "@/lib/api";
import { ModelRuntime } from "@/components/logicmodels/ModelRuntime";
import { PagesList } from "./PagesList";
import { BottomNav } from "./BottomNav";
import type { Page } from "@/features/pages/types";

interface HomeViewProps {
  onGoToSettings: () => void;
  onEditPage: (page: Page) => void;
}

export function HomeView({ onGoToSettings, onEditPage }: HomeViewProps) {
  const [pages, setPages] = useState<Page[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listPages();
      setPages(list);
      // Keep current active if still present; otherwise pick the first top-level.
      setActiveId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list.find((p) => !p.parent_id)?.id ?? null;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载页面失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = pages.find((p) => p.id === activeId) ?? null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
        <span>{active ? `/${active.slug}` : "首页"}</span>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onGoToSettings}
          aria-label="进入设置"
          title="进入设置"
        >
          <SettingsIcon className="size-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="p-6 text-center text-xs text-muted-foreground">加载中…</p>
        ) : !active ? (
          <div className="space-y-4 p-4">
            {pages.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center">
                <p className="text-sm font-medium">还没有配置任何页面</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  到底部导航的任意位置,或在「页面」标签里新建一个页面。
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-xs text-muted-foreground">
                点击底部导航里的页面进入查看。
              </p>
            )}
            <div className="rounded-lg border bg-card p-3">
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">已配置页面</h4>
              <PagesList onOpenPage={(p) => setActiveId(p.id)} />
            </div>
          </div>
        ) : active.model_slug ? (
          <div className="p-2">
            <ModelRuntime
              slug={active.model_slug}
              onBack={() => setActiveId(null)}
              onEdit={() => onEditPage(active)}
              onDeleted={async () => {
                await refresh();
                setActiveId(null);
              }}
            />
          </div>
        ) : (
          <div className="space-y-2 p-4">
            <p className="text-sm">
              <code className="font-mono">/{active.slug}</code> 没有关联逻辑模型
            </p>
            <p className="text-[11px] text-muted-foreground">
              到底部导航的「页面」标签里编辑此页,关联一个逻辑模型,即可显示数据表格。
            </p>
          </div>
        )}
      </div>

      <BottomNav
        pages={pages}
        activeId={activeId}
        onSelect={(p) => setActiveId(p.id)}
      />
    </div>
  );
}
