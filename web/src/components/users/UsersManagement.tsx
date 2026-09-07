import { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
  User as UserIcon,
  Users as UsersIcon,
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
  createAdminUser,
  createRegularUser,
  deleteAdminUser,
  deleteRegularUser,
  listAdminUsers,
  listRegularUsers,
  listRoles,
  resetAdminUserPassword,
  resetRegularUserPassword,
  updateAdminUser,
  updateRegularUser,
} from "@/lib/api";
import type {
  AuthUser,
  CreateUserInput,
  ManagedUser,
  Role,
  UpdateUserInput,
  UserKind,
} from "@/features/auth/types";
import { cn } from "@/lib/utils";

interface UsersManagementProps {
  currentUser: AuthUser;
}

export function UsersManagement({ currentUser }: UsersManagementProps) {
  const isAdmin = currentUser.user_kind === "admin";
  const [tab, setTab] = useState<UserKind>("admin");
  const [admins, setAdmins] = useState<ManagedUser[] | null>(null);
  const [regulars, setRegulars] = useState<ManagedUser[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [creating, setCreating] = useState<UserKind | null>(null);
  const [resetting, setResetting] = useState<ManagedUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [a, r, rs] = await Promise.all([
        listAdminUsers(),
        listRegularUsers(),
        listRoles(),
      ]);
      setAdmins(a);
      setRegulars(r);
      setRoles(rs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
      setAdmins([]);
      setRegulars([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rows = tab === "admin" ? admins : regulars;
  const loading = rows === null;

  const handleDelete = async (u: ManagedUser) => {
    if (!confirm(`确定删除用户 "${u.username}"?`)) return;
    try {
      if (u.user_kind === "admin") {
        await deleteAdminUser(u.id);
      } else {
        await deleteRegularUser(u.id);
      }
      toast.success("已删除");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const handleToggleDisabled = async (u: ManagedUser) => {
    try {
      const patch: UpdateUserInput = { disabled: !u.disabled };
      if (u.user_kind === "admin") {
        await updateAdminUser(u.id, patch);
      } else {
        await updateRegularUser(u.id, patch);
      }
      toast.success(u.disabled ? "已启用" : "已停用");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  return (
    <Card className="w-full max-w-3xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersIcon className="size-4 text-foreground/70" />
          用户管理
        </CardTitle>
        <CardDescription>
          超级管理员拥有全部权限,可在此管理其它管理员与普通用户,并为普通用户分配角色。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-md border bg-muted/30 p-0.5 text-xs">
            <TabButton
              active={tab === "admin"}
              onClick={() => setTab("admin")}
              count={admins?.length ?? 0}
            >
              超级管理员
            </TabButton>
            <TabButton
              active={tab === "regular"}
              onClick={() => setTab("regular")}
              count={regulars?.length ?? 0}
            >
              普通用户
            </TabButton>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreating(tab)}
          >
            <Plus className="size-3.5" />
            新建{tab === "admin" ? "管理员" : "普通用户"}
          </Button>
        </div>

        <ul className="divide-y divide-border rounded-lg ring-1 ring-foreground/5">
          {loading ? (
            <li className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              加载中…
            </li>
          ) : rows.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              暂无{tab === "admin" ? "管理员" : "普通用户"}
            </li>
          ) : (
            rows.map((u) => (
              <UserRow
                key={`${u.user_kind}-${u.id}`}
                user={u}
                roles={roles}
                isSelf={u.user_kind === currentUser.user_kind && u.id === currentUser.id}
                onEdit={() => setEditing(u)}
                onDelete={() => void handleDelete(u)}
                onResetPassword={() => setResetting(u)}
                onToggleDisabled={() => void handleToggleDisabled(u)}
              />
            ))
          )}
        </ul>

        {tab === "regular" ? (
          <p className="text-[11px] text-muted-foreground">
            普通用户登录后只能看到为其角色分配的 Tab。
            可在「角色」里编辑角色所含的权限,或在此为单个用户直接调整角色集合。
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            至少保留一名超级管理员,以免失去管理入口。{isAdmin ? "" : "你的账号不是超级管理员,此页面只读。"}
          </p>
        )}
      </CardContent>

      {(editing || creating) && (
        <UserEditorDialog
          open
          kind={creating ?? editing!.user_kind}
          initial={editing}
          roles={roles}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(null);
            void refresh();
          }}
        />
      )}

      {resetting && (
        <ResetPasswordDialog
          user={resetting}
          onClose={() => setResetting(null)}
          onSaved={() => {
            setResetting(null);
            void refresh();
          }}
        />
      )}
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {count}
      </span>
    </button>
  );
}

interface UserRowProps {
  user: ManagedUser;
  roles: Role[];
  isSelf: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onResetPassword: () => void;
  onToggleDisabled: () => void;
}

function UserRow({
  user,
  roles,
  isSelf,
  onEdit,
  onDelete,
  onResetPassword,
  onToggleDisabled,
}: UserRowProps) {
  const roleNames = user.role_ids
    .map((id) => roles.find((r) => r.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="flex items-center gap-1 font-medium text-foreground/90">
          {user.user_kind === "admin" ? (
            <ShieldCheck className="size-3.5 text-emerald-600" />
          ) : (
            <UserIcon className="size-3.5 text-muted-foreground" />
          )}
          {user.username}
        </span>
        {isSelf ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            当前账号
          </span>
        ) : null}
        {user.must_change_password ? (
          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
            待改密
          </span>
        ) : null}
        {user.user_kind === "regular" && user.disabled ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            已停用
          </span>
        ) : null}
        {roleNames.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            角色:{roleNames.join("、")}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">未分配角色</span>
        )}
      </div>
      <div className="flex items-center justify-end gap-1">
        {user.user_kind === "regular" ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={onToggleDisabled}
            title={user.disabled ? "启用账号" : "停用账号"}
          >
            {user.disabled ? (
              <ShieldCheck className="size-3.5" />
            ) : (
              <ShieldOff className="size-3.5" />
            )}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onResetPassword}
          title="重置密码"
        >
          <KeyRound className="size-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
          disabled={isSelf}
          onClick={onDelete}
          title={isSelf ? "不能删除当前账号" : "删除"}
        >
          <Trash2 className="size-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onEdit}
          title="编辑"
        >
          编辑
        </Button>
      </div>
    </li>
  );
}

interface UserEditorDialogProps {
  open: boolean;
  kind: UserKind;
  initial: ManagedUser | null;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}

function UserEditorDialog({
  open,
  kind,
  initial,
  roles,
  onClose,
  onSaved,
}: UserEditorDialogProps) {
  const isEdit = !!initial;
  const isCreatingAdmin = !isEdit && kind === "admin";
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [mustChange, setMustChange] = useState(true);
  const [disabled, setDisabled] = useState(initial?.disabled ?? false);
  const [roleIDs, setRoleIDs] = useState<number[]>(initial?.role_ids ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUsername(initial?.username ?? "");
    setPassword("");
    setMustChange(true);
    setDisabled(initial?.disabled ?? false);
    setRoleIDs(initial?.role_ids ?? []);
    setError(null);
  }, [open, initial]);

  const toggleRole = (id: number) => {
    setRoleIDs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submit = async () => {
    setError(null);
    if (!/^[\w.@+-]{2,64}$/.test(username.trim())) {
      setError("用户名长度 2~64,仅允许字母、数字、_ . @ + -");
      return;
    }
    if (!isEdit && password.length < 6) {
      setError("密码至少 6 位");
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && initial) {
        const patch: UpdateUserInput = {
          username: username.trim(),
          role_ids: roleIDs,
          must_change_password: mustChange,
        };
        if (initial.user_kind === "admin") {
          await updateAdminUser(initial.id, patch);
        } else {
          await updateRegularUser(initial.id, { ...patch, disabled });
        }
      } else {
        const input: CreateUserInput = {
          username: username.trim(),
          password,
          role_ids: roleIDs,
          must_change_password: mustChange,
        };
        if (isCreatingAdmin) {
          await createAdminUser(input);
        } else {
          await createRegularUser({ ...input, disabled });
        }
      }
      toast.success(isEdit ? "已保存" : "已新建");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={
        isEdit
          ? `编辑${kind === "admin" ? "管理员" : "普通用户"}`
          : `新建${kind === "admin" ? "管理员" : "普通用户"}`
      }
      description={
        kind === "admin"
          ? "超级管理员默认拥有全部权限,可在此调整其角色集合。"
          : "为普通用户分配一个或多个角色,其可见的功能由角色权限决定。"
      }
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={submitting} onClick={() => void submit()}>
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">用户名</label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="h-8 font-mono text-sm"
            autoFocus
          />
        </div>
        {!isEdit ? (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">初始密码</label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              className="h-8 font-mono text-sm"
            />
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={mustChange}
              onChange={(e) => setMustChange(e.target.checked)}
              className="size-3.5"
            />
            首次登录必须修改密码
          </label>
          {kind === "regular" ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={disabled}
                onChange={(e) => setDisabled(e.target.checked)}
                className="size-3.5"
              />
              停用账号
            </label>
          ) : null}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">分配角色</label>
          {roles.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">暂无可用角色。</p>
          ) : (
            <div className="grid max-h-44 gap-1 overflow-y-auto rounded-md border bg-muted/20 p-2">
              {roles.map((r) => (
                <label
                  key={r.id}
                  className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-background"
                >
                  <input
                    type="checkbox"
                    checked={roleIDs.includes(r.id)}
                    onChange={() => toggleRole(r.id)}
                    className="size-3.5"
                  />
                  <span className="font-medium">{r.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    ({r.code})
                  </span>
                  {r.is_system ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      内置
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          )}
        </div>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onSaved,
}: {
  user: ManagedUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }
    setSubmitting(true);
    try {
      if (user.user_kind === "admin") {
        await resetAdminUserPassword(user.id, password);
      } else {
        await resetRegularUserPassword(user.id, password);
      }
      toast.success("密码已重置");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={`重置 ${user.username} 的密码`}
      description="新密码在保存后会强制该用户下次登录时修改。"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={submitting} onClick={() => void submit()}>
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <KeyRound className="size-3.5" />
            )}
            重置
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Input
          type="text"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="新密码(至少 6 位)"
          className="h-8 font-mono text-sm"
        />
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
