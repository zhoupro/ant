import { Database, Settings as SettingsIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface DBLoadPanelProps {
  onGoToSettings: () => void;
}

export function DBLoadPanel({ onGoToSettings }: DBLoadPanelProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card className="shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted">
            <Database className="size-5 text-foreground/70" />
          </div>
          <CardTitle className="text-lg">尚未配置数据库</CardTitle>
          <CardDescription>
            数据库路径由「设置中心」统一管理，保存后会自动加载
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-center text-xs text-muted-foreground">
            前往设置中心配置 <code className="font-mono">managed_db_path</code>，
            指向本机上的 SQLite 文件（不存在会自动创建）。
            配置保存后即可在此处管理其中的表与数据。
          </p>
          <Button type="button" onClick={onGoToSettings}>
            <SettingsIcon className="size-3.5" />
            前往设置中心
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}