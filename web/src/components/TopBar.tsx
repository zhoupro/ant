import { LogOut, StickyNote } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { User } from "@/features/auth/types";

interface TopBarProps {
  user: User;
  onNew: () => void;
  onLogout: () => Promise<void> | void;
}

export function TopBar({ user, onNew, onLogout }: TopBarProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/60 bg-background/80 px-4 py-3 supports-[backdrop-filter]:backdrop-blur">
      <div className="flex items-center gap-2 text-base font-semibold">
        <StickyNote className="size-4 text-foreground/70" />
        <span>便签</span>
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          {user.username}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onNew}>
          ＋ 新建
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void onLogout()}
          aria-label="退出登录"
          title="退出登录"
        >
          <LogOut className="size-3.5" />
          退出
        </Button>
      </div>
    </header>
  );
}
