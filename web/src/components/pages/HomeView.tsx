import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listPages } from "@/lib/api";
import { ModelRuntime } from "@/components/logicmodels/ModelRuntime";
import { PagesList } from "./PagesList";
import { BottomNav } from "./BottomNav";
import type { Page } from "@/features/pages/types";
import { renderIcon } from "@/features/pages/icon";
import { cn } from "@/lib/utils";

interface HomeViewProps {
  onGoToSettings: () => void;
}

export function HomeView({ onGoToSettings }: HomeViewProps) {
  const [pages, setPages] = useState<Page[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listPages();
      setPages(list);
      setActiveId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list.find((p) => !p.parent_id)?.id ?? null;
      });
    } catch {
      // 无权限或后端错误时,降级到空列表,不打扰用户。
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = pages.find((p) => p.id === activeId) ?? null;
  const topLevel = useMemo(
    () => pages.filter((p) => !p.parent_id).sort((a, b) => a.sort - b.sort),
    [pages],
  );
  const byParent = useMemo(() => {
    const m = new Map<string, Page[]>();
    for (const p of pages) {
      if (!p.parent_id) continue;
      const list = m.get(p.parent_id) ?? [];
      list.push(p);
      m.set(p.parent_id, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => a.sort - b.sort);
    }
    return m;
  }, [pages]);

  // The currently-active top-level page is whichever ancestor has no
  // parent (or null when active is a top-level page itself).
  const activeTopLevel = useMemo(() => {
    if (!active) return null;
    if (!active.parent_id) return active;
    return pages.find((p) => p.id === active.parent_id) ?? null;
  }, [active, pages]);

  const subPages = activeTopLevel ? byParent.get(activeTopLevel.id) ?? [] : [];

  return (
    <div className="flex flex-1 flex-col">
      {!active ? (
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
          <span>首页</span>
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
      ) : null}

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
              onDeleted={async () => {
                await refresh();
                setActiveId(null);
              }}
              hideHeader
            />
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center">
              <p className="text-sm font-medium">
                <code className="font-mono">/{active.slug}</code> 没有关联逻辑模型
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {subPages.length > 0
                  ? "下方有子页面,点一下试试 —— 通常父页只做导航,数据在子页里。"
                  : "到底部导航的「页面」标签里编辑此页,关联一个逻辑模型,即可显示数据表格。"}
              </p>
            </div>
            {topLevel.length > 0 ? (
              <div className="rounded-lg border bg-card p-3">
                <h4 className="mb-2 text-xs font-medium text-muted-foreground">已配置页面</h4>
                <PagesList onOpenPage={(p) => setActiveId(p.id)} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {secondaryOpen && activeTopLevel && subPages.length > 0 ? (
        <SubPageTabs
          subPages={subPages}
          activeChildSlug={
            active && active.parent_id === activeTopLevel.id
              ? active.slug
              : null
          }
          onSelectSub={(sub) => {
            setActiveId(sub.id);
            setSecondaryOpen(true);
          }}
        />
      ) : null}

      <BottomNav
        pages={pages}
        activeId={activeId}
        onSelect={(p) => {
          if (activeTopLevel?.id === p.id) {
            setSecondaryOpen((prev) => !prev);
            return;
          }
          if (!p.model_slug) {
            return;
          }
          setActiveId(p.id);
          setSecondaryOpen(false);
        }}
        onGoToSettings={onGoToSettings}
      />
    </div>
  );
}

interface SubPageTabsProps {
  subPages: Page[];
  activeChildSlug: string | null;
  onSelectSub: (sub: Page) => void;
}

function SubPageTabs({ subPages, activeChildSlug, onSelectSub }: SubPageTabsProps) {
  return (
    <div className="flex w-full justify-start border-t border-border/60 bg-background/95 backdrop-blur">
      {subPages.map((sub) => {
        const Icon = renderIcon(sub.icon);
        const active = sub.slug === activeChildSlug;
        return (
          <button
            key={sub.id}
            type="button"
            onClick={() => onSelectSub(sub)}
            aria-current={active ? "page" : undefined}
            title={`${sub.label} (/${sub.slug})`}
            className={cn(
              "relative flex min-w-[72px] flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-5" />
            <span className="truncate px-2">{sub.label}</span>
            {active ? (
              <span className="absolute left-1/2 top-0 h-0.5 w-6 -translate-x-1/2 rounded-full bg-foreground" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
