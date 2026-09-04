import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  listSettings,
  updateSetting,
  type Setting,
} from "@/lib/api";

const UPLOAD_ROOT_KEY = "upload_root";

export function Settings() {
  const [items, setItems] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadRoot, setUploadRoot] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSettings();
      setItems(list);
      const current = list.find((s) => s.key === UPLOAD_ROOT_KEY);
      setUploadRoot(current?.value ?? "");
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = useCallback(async () => {
    const next = uploadRoot.trim();
    if (!next) {
      toast.error("路径不能为空");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateSetting(UPLOAD_ROOT_KEY, next);
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.key === UPLOAD_ROOT_KEY);
        if (idx === -1) return [...prev, updated];
        const copy = prev.slice();
        copy[idx] = updated;
        return copy;
      });
      setUploadRoot(updated.value);
      setDirty(false);
      toast.success("设置已保存，后续上传将使用新目录");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [uploadRoot]);

  return (
    <Card className="w-full max-w-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SettingsIcon className="size-4 text-foreground/70" />
          设置中心
        </CardTitle>
        <CardDescription>
          配置文件上传的根目录，修改后立即对新上传生效
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="setting-upload-root"
              className="text-xs text-muted-foreground"
            >
              上传根目录
            </label>
            {dirty ? (
              <span className="text-[11px] text-amber-600">未保存</span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Input
              id="setting-upload-root"
              value={uploadRoot}
              placeholder={loading ? "加载中…" : "/var/data/uploads"}
              onChange={(e) => {
                setUploadRoot(e.target.value);
                setDirty(true);
              }}
              disabled={loading}
              className="font-mono text-xs"
            />
            <Button
              onClick={() => void onSave()}
              disabled={!dirty || saving || loading}
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              保存
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            支持绝对路径（如 <code className="font-mono">/data/uploads</code>）或相对路径（相对应用运行目录）。
            修改时会校验目录是否可读写；已上传的文件不会迁移。
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="text-xs text-muted-foreground">所有设置项</h3>
          <ul className="divide-y divide-border rounded-lg ring-1 ring-foreground/5">
            {loading ? (
              <li className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
                <Loader2 className="mr-2 size-3.5 animate-spin" />
                加载中…
              </li>
            ) : items.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                暂无配置
              </li>
            ) : (
              items.map((s) => (
                <li
                  key={s.key}
                  className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 px-3 py-2 text-xs"
                >
                  <span className="font-mono text-foreground/80">{s.key}</span>
                  <span className="truncate font-mono text-muted-foreground">
                    {s.value}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
