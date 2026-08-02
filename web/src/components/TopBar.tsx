import { StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TopBarProps {
  onNew: () => void;
}

export function TopBar({ onNew }: TopBarProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 supports-[backdrop-filter]:backdrop-blur">
      <div className="flex items-center gap-2 text-base font-semibold">
        <StickyNote className="size-4 text-foreground/70" />
        <span>便签</span>
      </div>
      <Button size="sm" onClick={onNew}>
        ＋ 新建
      </Button>
    </header>
  );
}
