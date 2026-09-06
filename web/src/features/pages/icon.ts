import * as LucideIcons from "lucide-react";
import { Home as HomeIcon } from "lucide-react";

export function renderIcon(
  name: string,
): React.ComponentType<{ className?: string }> {
  if (name && (LucideIcons as Record<string, unknown>)[name]) {
    return LucideIcons[name as keyof typeof LucideIcons] as React.ComponentType<{
      className?: string;
    }>;
  }
  return HomeIcon;
}
