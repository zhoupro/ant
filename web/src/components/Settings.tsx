import { useCallback, useEffect, useState } from "react";
import {
  Copy,
  Database,
  FolderOpen,
  KeyRound,
  Loader2,
  Plus,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { APIToken } from "@/features/auth/types";
import {
  changePassword,
  createAPIToken,
  listAPITokens,
  listSettings,
  revokeAPIToken,
  updateSetting,
  type Setting,
} from "@/lib/api";
import { formatDateTime } from "@/lib/api";

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

export function Settings({
  username,
  onUsernameChanged,
}: {
  username: string;
  onUsernameChanged?: (next: string) => void;
}) {
  const [items, setItems] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadRoot, setUploadRoot] = useState<FieldState>(makeField(""));
  const [managedDb, setManagedDb] = useState<FieldState>(makeField(""));
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [newUsername, setNewUsername] = useState(username);
  const [pwdSaving, setPwdSaving] = useState(false);

  const [tokens, setTokens] = useState<APIToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenExpiry, setNewTokenExpiry] = useState("30");
  const [creatingToken, setCreatingToken] = useState(false);
  const [issuedToken, setIssuedToken] = useState<{
    token: APIToken;
    plain: string;
  } | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

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

  useEffect(() => {
    setNewUsername(username);
  }, [username]);

  const refreshTokens = useCallback(async () => {
    setTokensLoading(true);
    try {
      const list = await listAPITokens();
      setTokens(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载令牌失败");
    } finally {
      setTokensLoading(false);
      setTokensLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refreshTokens();
  }, [refreshTokens]);

  const handleCreateToken = useCallback(async () => {
    const trimmedName = newTokenName.trim();
    const days = Number(newTokenExpiry);
    if (!Number.isFinite(days) || days < 0 || days > 3650) {
      toast.error("有效期需为 0~3650 之间的整数（0 表示永不过期）");
      return;
    }
    setCreatingToken(true);
    try {
      const payload: { name?: string; expires_in_days?: number } = {};
      if (trimmedName) payload.name = trimmedName;
      if (days > 0) payload.expires_in_days = Math.floor(days);
      const result = await createAPIToken(payload);
      setIssuedToken(result);
      setCreateOpen(false);
      setNewTokenName("");
      setNewTokenExpiry("30");
      await refreshTokens();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "创建令牌失败");
    } finally {
      setCreatingToken(false);
    }
  }, [newTokenName, newTokenExpiry, refreshTokens]);

  const handleRevokeToken = useCallback(
    async (t: APIToken) => {
      if (t.revoked_at) return;
      if (!window.confirm(`确定吊销令牌「${t.name}」? 吊销后无法恢复。`)) return;
      setRevokingId(t.id);
      try {
        await revokeAPIToken(t.id);
        toast.success("令牌已吊销");
        await refreshTokens();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "吊销失败");
      } finally {
        setRevokingId(null);
      }
    },
    [refreshTokens],
  );

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
          <div className="flex items-baseline gap-1.5">
            <KeyRound className="size-3.5 text-muted-foreground" />
            <h3 className="text-xs text-muted-foreground">修改用户名 / 密码</h3>
          </div>
          <p className="text-[11px] text-muted-foreground">
            数据保存在 <code className="font-mono">data/app.db</code>(系统数据库),不会因为重启或切换受管数据库而丢失,除非手动删除了该文件。
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="setting-username"
                className="text-[11px] text-muted-foreground"
              >
                用户名
              </label>
              <Input
                id="setting-username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="用户名(2~64 位)"
                className="h-8 font-mono text-xs"
                autoComplete="username"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="setting-current-password"
                className="text-[11px] text-muted-foreground"
              >
                当前密码
              </label>
              <Input
                id="setting-current-password"
                type="password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                placeholder="当前密码"
                className="h-8 font-mono text-xs"
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="setting-new-password"
                className="text-[11px] text-muted-foreground"
              >
                新密码
              </label>
              <Input
                id="setting-new-password"
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="新密码(至少 6 位)"
                className="h-8 font-mono text-xs"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="setting-confirm-password"
                className="text-[11px] text-muted-foreground"
              >
                再次输入新密码
              </label>
              <Input
                id="setting-confirm-password"
                type="password"
                value={newPwd2}
                onChange={(e) => setNewPwd2(e.target.value)}
                placeholder="再次输入新密码"
                className="h-8 font-mono text-xs"
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!oldPwd || !newPwd || !newUsername.trim() || pwdSaving}
              onClick={async () => {
                const trimmedName = newUsername.trim();
                if (trimmedName.length < 2 || trimmedName.length > 64) {
                  toast.error("用户名长度需在 2~64 之间");
                  return;
                }
                if (newPwd.length < 6) {
                  toast.error("新密码至少 6 位");
                  return;
                }
                if (newPwd !== newPwd2) {
                  toast.error("两次输入的新密码不一致");
                  return;
                }
                if (newPwd === oldPwd && trimmedName === username) {
                  toast.error("用户名与密码均未修改");
                  return;
                }
                setPwdSaving(true);
                try {
                  const payload: {
                    old_password: string;
                    new_password: string;
                    new_username?: string;
                  } = { old_password: oldPwd, new_password: newPwd };
                  if (trimmedName !== username) {
                    payload.new_username = trimmedName;
                  }
                  const next = await changePassword(payload);
                  toast.success("账号信息已更新");
                  setOldPwd("");
                  setNewPwd("");
                  setNewPwd2("");
                  if (trimmedName !== username) {
                    onUsernameChanged?.(next.username);
                  }
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "修改失败");
                } finally {
                  setPwdSaving(false);
                }
              }}
            >
              {pwdSaving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              更新账号
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-muted-foreground" />
              <h3 className="text-xs text-muted-foreground">API 令牌</h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
              disabled={tokensLoading}
            >
              <Plus className="size-3.5" />
              新建令牌
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            用于通过{" "}
            <code className="font-mono">
              {`Authorization: Bearer <token>`}
            </code>{" "}
            访问受保护 API。明文仅在创建时返回一次，请妥善保存。
          </p>
          <ul className="divide-y divide-border rounded-lg ring-1 ring-foreground/5">
            {!tokensLoaded ? (
              <li className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
                <Loader2 className="mr-2 size-3.5 animate-spin" />
                加载中…
              </li>
            ) : tokens.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                尚未创建任何令牌
              </li>
            ) : (
              tokens.map((t) => {
                const revoked = !!t.revoked_at;
                const expired = !revoked && !!t.expires_at && new Date(t.expires_at).getTime() <= Date.now();
                const status = revoked
                  ? "已吊销"
                  : expired
                    ? "已过期"
                    : "有效";
                return (
                  <li
                    key={t.id}
                    className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3 py-2 text-xs"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-medium text-foreground/90">{t.name}</span>
                      <span className="font-mono text-muted-foreground">{t.prefix}…</span>
                      <span
                        className={
                          revoked || expired
                            ? "rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            : "rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        }
                      >
                        {status}
                      </span>
                    </div>
                    <div className="flex items-center justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        disabled={revoked || revokingId === t.id}
                        onClick={() => void handleRevokeToken(t)}
                      >
                        {revokingId === t.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                        吊销
                      </Button>
                    </div>
                    <div className="col-span-2 grid grid-cols-2 gap-x-3 text-[11px] text-muted-foreground sm:grid-cols-3">
                      <span>创建 {formatDateTime(t.created_at)}</span>
                      <span>过期 {t.expires_at ? formatDateTime(t.expires_at) : "永不过期"}</span>
                      <span>最近使用 {t.last_used_at ? formatDateTime(t.last_used_at) : "—"}</span>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
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

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) {
            setNewTokenName("");
            setNewTokenExpiry("30");
          }
          setCreateOpen(open);
        }}
        title="新建 API 令牌"
        description="为外部脚本或第三方调用签发一个长期令牌。"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateOpen(false)}
              disabled={creatingToken}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => void handleCreateToken()}
              disabled={creatingToken}
            >
              {creatingToken ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="api-token-name"
              className="text-xs text-muted-foreground"
            >
              名称
            </label>
            <Input
              id="api-token-name"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              placeholder="例如：自动化脚本"
              className="h-8 font-mono text-xs"
              maxLength={64}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="api-token-expiry"
              className="text-xs text-muted-foreground"
            >
              有效期（天，0 = 永不过期）
            </label>
            <Input
              id="api-token-expiry"
              type="number"
              min={0}
              max={3650}
              value={newTokenExpiry}
              onChange={(e) => setNewTokenExpiry(e.target.value)}
              className="h-8 font-mono text-xs"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            创建后明文仅展示一次，请立刻复制保存。
          </p>
        </div>
      </Dialog>

      <Dialog
        open={!!issuedToken}
        onOpenChange={(open) => {
          if (!open) setIssuedToken(null);
        }}
        title="请复制并妥善保存新令牌"
        description="关闭此对话框后将无法再次查看明文。"
        size="md"
        footer={
          <Button
            size="sm"
            onClick={() => setIssuedToken(null)}
          >
            我已保存
          </Button>
        }
      >
        {issuedToken ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">名称</div>
              <div className="text-sm">{issuedToken.token.name}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">令牌明文</div>
              <div className="flex items-stretch gap-2">
                <Input
                  readOnly
                  value={issuedToken.plain}
                  className="h-9 font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(issuedToken.plain);
                      toast.success("已复制到剪贴板");
                    } catch {
                      toast.error("复制失败，请手动选中复制");
                    }
                  }}
                >
                  <Copy className="size-3.5" />
                  复制
                </Button>
              </div>
            </div>
            <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
{`curl 示例：
curl -H "Authorization: Bearer ${issuedToken.plain}" \\
     ${typeof window !== "undefined" ? window.location.origin : ""}/api/auth/me`}
            </pre>
          </div>
        ) : null}
      </Dialog>
    </Card>
  );
}