import { useCallback, useEffect, useState } from "react";
import {
  Copy,
  KeyRound,
  Loader2,
  Plus,
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
import {
  createAPIToken,
  formatDateTime,
  listAPITokens,
  revokeAPIToken,
} from "@/lib/api";
import type { APIToken } from "@/features/auth/types";

export function APITokens() {
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

  return (
    <Card className="w-full max-w-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-foreground/70" />
          API 令牌
        </CardTitle>
        <CardDescription>
          用于通过 <code className="font-mono">Authorization: Bearer &lt;token&gt;</code>{" "}
          访问受保护 API。明文仅在创建时返回一次，请妥善保存。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-end">
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
              const expired =
                !revoked &&
                !!t.expires_at &&
                new Date(t.expires_at).getTime() <= Date.now();
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
                    <span>
                      过期 {t.expires_at ? formatDateTime(t.expires_at) : "永不过期"}
                    </span>
                    <span>
                      最近使用{" "}
                      {t.last_used_at ? formatDateTime(t.last_used_at) : "—"}
                    </span>
                  </div>
                </li>
              );
            })
          )}
        </ul>
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          <span>
            完整接口定义可在右上角「API 文档」查阅。请勿在浏览器或前端代码中硬编码长期令牌。
          </span>
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
          <Button size="sm" onClick={() => setIssuedToken(null)}>
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
