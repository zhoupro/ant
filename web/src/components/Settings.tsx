import { useCallback, useEffect, useState } from "react";
import { Database, FolderOpen, Loader2, Save, Settings as SettingsIcon } from "lucide-react";
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
const MANAGED_DB_KEY = "managed_db_path";

interface FieldState {
  value: string;
  initial: string;
  saving: boolean;
  dirty: boolean;
}

function makeField(initial: string): FieldState {
  return { value: initial, initial, saving: false, dirty: false };
}

function isDirty(f: FieldState): boolean {
  return f.value.trim() !== f.initial;
}

export function Settings() {
  const [items, setItems] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadRoot, setUploadRoot] = useState<FieldState>(makeField(""));
  const [managedDb, setManagedDb] = useState<FieldState>(makeField(""));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSettings();
      setItems(list);
      const next = (key: string) => list.find((s) => s.key === key)?.value ?? "";
      setUploadRoot((prev) => {
        const v = next(UPLOAD_ROOT_KEY);
        return { ...prev, value: v, initial: v, dirty: false };
      });
      setManagedDb((prev) => {
        const v = next(MANAGED_DB_KEY);
        return { ...prev, value: v, initial: v, dirty: false };
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveField = useCallback(
    async (key: string, value: string) => {
      const updated = await updateSetting(key, value);
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.key === key);
        if (idx === -1) return [...prev, updated];
        const copy = prev.slice();
        copy[idx] = updated;
        return copy;
      });
      return updated;
    },
    [],
  );

  const saveUploadRoot = useCallback(async () => {
    const next = uploadRoot.value.trim();
    if (!next) {
      toast.error("路径不能为空");
      return;
    }
    setUploadRoot((p) => ({ ...p, saving: true }));
    try {
      const updated = await saveField(UPLOAD_ROOT_KEY, next);
      setUploadRoot((p) => ({ ...p, value: updated.value, initial: updated.value, dirty: false }));
      toast.success("设置已保存，后续上传将使用新目录");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setUploadRoot((p) => ({ ...p, saving: false }));
    }
  }, [uploadRoot.value, saveField]);

  const saveManagedDb = useCallback(async () => {
    const trimmed = managedDb.value.trim();
    setManagedDb((p) => ({ ...p, saving: true }));
    try {
      const updated = await saveField(MANAGED_DB_KEY, trimmed);
      setManagedDb((p) => ({
        ...p,
        value: updated.value,
        initial: updated.value,
        dirty: false,
      }));
      toast.success(
        trimmed === ""
          ? "已清空数据库路径，数据库已卸载"
          : "数据库已加载",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setManagedDb((p) => ({ ...p, saving: false }));
    }
  }, [managedDb.value, saveField]);

  return (
    <Card className="w-full max-w-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SettingsIcon className="size-4 text-foreground/70" />
          设置中心
        </CardTitle>
        <CardDescription>
          配置文件上传目录与受管数据库路径，修改后立即生效
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="setting-upload-root"
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <FolderOpen className="size-3.5" />
              上传根目录
            </label>
            {isDirty(uploadRoot) ? (
              <span className="text-[11px] text-amber-600">未保存</span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Input
              id="setting-upload-root"
              value={uploadRoot.value}
              placeholder={loading ? "加载中…" : "/var/data/uploads"}
              onChange={(e) =>
                setUploadRoot((p) => ({ ...p, value: e.target.value, dirty: true }))
              }
              disabled={loading}
              className="font-mono text-xs"
            />
            <Button
              onClick={() => void saveUploadRoot()}
              disabled={!isDirty(uploadRoot) || uploadRoot.saving || loading}
            >
              {uploadRoot.saving ? (
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
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="setting-managed-db"
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Database className="size-3.5" />
              数据库路径
            </label>
            {isDirty(managedDb) ? (
              <span className="text-[11px] text-amber-600">未保存</span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Input
              id="setting-managed-db"
              value={managedDb.value}
              placeholder={loading ? "加载中…" : "/var/data/managed.db"}
              onChange={(e) =>
                setManagedDb((p) => ({ ...p, value: e.target.value, dirty: true }))
              }
              disabled={loading}
              className="font-mono text-xs"
            />
            <Button
              onClick={() => void saveManagedDb()}
              disabled={!isDirty(managedDb) || managedDb.saving || loading}
            >
              {managedDb.saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              保存
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            指向本机上的 SQLite 文件（<code className="font-mono">.db</code> / <code className="font-mono">.sqlite</code>）。
            父目录不存在会自动创建；文件不存在会自动创建空数据库。
            保存后立即生效（无需重启）。留空表示不管理任何数据库。
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