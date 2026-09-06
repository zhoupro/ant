import * as LucideIcons from "lucide-react";
import { Home as HomeIcon, Settings as SettingsIcon } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { Page } from "@/features/pages/types";

interface BottomNavProps {
  pages: Page[];
  activeId: string | null;
  onSelect: (page: Page) => void;
  onGoToSettings: () => void;
}

export function BottomNav({ pages, activeId, onSelect, onGoToSettings }: BottomNavProps) {
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

  if (topLevel.length === 0) {
    return (
      <nav
        aria-label="页面导航"
        className="sticky bottom-0 z-10 flex w-full items-center justify-center gap-2 border-t border-border/60 bg-background/90 px-4 py-3 text-[11px] text-muted-foreground backdrop-blur"
      >
        <button
          type="button"
          onClick={onGoToSettings}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"
        >
          <SettingsIcon className="size-3" />
          前往设置中心
        </button>
        <span>尚未配置任何页面</span>
      </nav>
    );
  }

  const pageSlots = Math.min(topLevel.length, 4);
  const cols = pageSlots + 1;

  return (
    <nav
      aria-label="页面导航"
      className="sticky bottom-0 z-10 grid w-full border-t border-border/60 bg-background/95 backdrop-blur"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {topLevel.slice(0, pageSlots).map((page) => {
        const Icon = renderIcon(page.icon);
        const active = activeId === page.id;
        const children = byParent.get(page.id) ?? [];
        return (
          <div key={page.id} className="relative">
            <button
              type="button"
              onClick={() => onSelect(page)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex w-full flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-5" />
              <span className="truncate px-1">{page.label}</span>
              {active ? (
                <span className="absolute left-1/2 top-0 h-0.5 w-6 -translate-x-1/2 rounded-full bg-foreground" />
              ) : null}
            </button>
            {children.length > 0 ? (
              <div className="absolute bottom-full left-1/2 hidden w-40 -translate-x-1/2 pb-1 group-hover:block">
                <ul className="rounded-md border bg-card p-1 text-xs shadow-md">
                  {children.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(c)}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left hover:bg-muted"
                      >
                        <span>{c.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onGoToSettings}
        className="flex flex-col items-center gap-0.5 border-l border-border/40 py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-label="设置中心"
      >
        <SettingsIcon className="size-5" />
        <span>设置</span>
      </button>
    </nav>
  );
}

function renderIcon(name: string): React.ComponentType<{ className?: string }> {
  if (name && (LucideIcons as Record<string, unknown>)[name]) {
    return LucideIcons[name as keyof typeof LucideIcons] as React.ComponentType<{ className?: string }>;
  }
  return HomeIcon;
}
