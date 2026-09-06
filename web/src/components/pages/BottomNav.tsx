import { Settings as SettingsIcon } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { Page } from "@/features/pages/types";
import { renderIcon } from "@/features/pages/icon";

interface BottomNavProps {
  pages: Page[];
  activeId: string | null;
  onSelect: (page: Page) => void;
  onGoToSettings: () => void;
}

const TOP_SLOTS = 4;

export function BottomNav({ pages, activeId, onSelect, onGoToSettings }: BottomNavProps) {
  const topLevel = useMemo(
    () => pages.filter((p) => !p.parent_id).sort((a, b) => a.sort - b.sort),
    [pages],
  );

  const active = pages.find((p) => p.id === activeId) ?? null;
  const activeTopLevel = active && !active.parent_id
    ? active
    : active && active.parent_id
      ? pages.find((p) => p.id === active.parent_id) ?? null
      : null;

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

  const slots = topLevel.slice(0, TOP_SLOTS);
  const cols = slots.length + 1;

  return (
    <nav
      aria-label="页面导航"
      className="sticky bottom-0 z-10 grid w-full border-t border-border/60 bg-background/95 backdrop-blur"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {slots.map((page) => {
        const Icon = renderIcon(page.icon);
        const isActive = activeId === page.id;
        const isParentActive =
          !isActive && activeTopLevel?.id === page.id;
        return (
          <button
            key={page.id}
            type="button"
            onClick={() => onSelect(page)}
            aria-current={isActive ? "page" : undefined}
            title={`${page.label} (/${page.slug})`}
            className={cn(
              "relative flex w-full flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              isActive
                ? "text-foreground"
                : isParentActive
                  ? "text-foreground/80"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-5" />
            <span className="truncate px-1">{page.label}</span>
            {isActive ? (
              <span className="absolute left-1/2 top-0 h-0.5 w-6 -translate-x-1/2 rounded-full bg-foreground" />
            ) : isParentActive ? (
              <span className="absolute left-1/2 top-0 h-0.5 w-4 -translate-x-1/2 rounded-full bg-muted-foreground/40" />
            ) : null}
          </button>
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
