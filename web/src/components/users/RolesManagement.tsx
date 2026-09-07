import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
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
  createRole,
  deleteRole,
  listPermissions,
  listRoles,
  updateRole,
} from "@/lib/api";
import type {
  CreateRoleInput,
  PermissionCategory,
  PermissionItem,
  Role,
  UpdateRoleInput,
} from "@/features/auth/types";
import {
  PERMISSION_CATEGORY_DESCRIPTION,
  PERMISSION_CATEGORY_LABEL,
  groupPermissions,
} from "@/features/permissions/catalog";
import { cn } from "@/lib/utils";

export function RolesManagement() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [perms, setPerms] = useState<PermissionItem[] | null>(null);
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([listRoles(), listPermissions()]);
      setRoles(r);
      setPerms(p);
      setSelectedId((prev) => {
        if (prev && r.some((x) => x.id === prev)) return prev;
        return r[0]?.id ?? null;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
      setRoles([]);
      setPerms([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = async (r: Role) => {
    if (r.is_system) return;
    if (!confirm(`删除角色 "${r.name}" 吗?持有此角色的用户会一并失去其权限。`)) return;
    try {
      await deleteRole(r.id);
      toast.success("已删除");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const selected = useMemo(
    () => roles?.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId],
  );

  const grouped = useMemo(() => groupPermissions(perms ?? []), [perms]);

  return (
    <Card className="w-full max-w-4xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-foreground/70" />
          角色管理
        </CardTitle>
        <CardDescription>
          创建自定义角色并配置可见的功能与可执行的操作,然后把角色分配给普通用户。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <aside className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                共 {roles?.length ?? 0} 个角色
              </span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setCreating(true)}
              >
                <Plus className="size-3" />
                新建
              </Button>
            </div>
            <ul className="divide-y divide-border rounded-lg ring-1 ring-foreground/5">
              {roles === null ? (
                <li className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  加载中…
                </li>
              ) : roles.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                  暂无角色
                </li>
              ) : (
                roles.map((r) => (
                  <li
                    key={r.id}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-muted/40",
                      selectedId === r.id && "bg-muted/60",
                    )}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground/90">
                        {r.name}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <code className="font-mono">{r.code}</code>
                        {r.is_system ? (
                          <span className="rounded bg-muted px-1">内置</span>
                        ) : null}
                        <span>· {r.permission_ids.length} 项权限</span>
                      </div>
                    </div>
                    {!r.is_system ? (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(r);
                        }}
                        title="删除"
                      >
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </aside>

          <section>
            {selected && perms ? (
              <RolePermissionMatrix
                role={selected}
                permissions={perms}
                grouped={grouped}
                onEdit={() => setEditing(selected)}
                onSaved={refresh}
              />
            ) : (
              <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
                选择左侧角色查看其权限。
              </p>
            )}
          </section>
        </div>
      </CardContent>

      {(editing || creating) && (
        <RoleEditorDialog
          open
          initial={editing}
          permissions={perms ?? []}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            void refresh();
          }}
        />
      )}
    </Card>
  );
}

interface RolePermissionMatrixProps {
  role: Role;
  permissions: PermissionItem[];
  grouped: { category: PermissionCategory; items: PermissionItem[] }[];
  onEdit: () => void;
  onSaved: () => void;
}

function RolePermissionMatrix({
  role,
  grouped,
  onEdit,
}: RolePermissionMatrixProps) {
  const owned = new Set(role.permission_ids);
  return (
    <div className="space-y-3">
      <header className="flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-medium">{role.name}</h3>
          <p className="text-[11px] text-muted-foreground">
            <code className="font-mono">{role.code}</code> · {role.description || "无描述"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onEdit}>
          编辑
        </Button>
      </header>
      <div className="space-y-3">
        {grouped.map(({ category, items }) => (
          <div key={category} className="rounded-md border bg-card">
            <div className="flex items-baseline justify-between border-b px-3 py-1.5">
              <span className="text-xs font-medium">
                {PERMISSION_CATEGORY_LABEL[category]}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {PERMISSION_CATEGORY_DESCRIPTION[category]}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {items.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start gap-2 px-3 py-1.5 text-xs"
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      owned.has(p.id)
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-muted-foreground/40 text-transparent",
                    )}
                    aria-label={owned.has(p.id) ? "已拥有" : "未拥有"}
                  >
                    ✓
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      <code className="font-mono">{p.code}</code> · {p.description}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RoleEditorDialogProps {
  open: boolean;
  initial: Role | null;
  permissions: PermissionItem[];
  onClose: () => void;
  onSaved: () => void;
}

function RoleEditorDialog({
  open,
  initial,
  permissions,
  onClose,
  onSaved,
}: RoleEditorDialogProps) {
  const isEdit = !!initial;
  const isSystem = initial?.is_system ?? false;
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [permIDs, setPermIDs] = useState<number[]>(initial?.permission_ids ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(initial?.code ?? "");
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setPermIDs(initial?.permission_ids ?? []);
    setError(null);
  }, [open, initial]);

  const toggle = (id: number) => {
    setPermIDs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("角色名不能为空");
      return;
    }
    if (!isEdit && !/^[a-z][a-z0-9_]{0,63}$/.test(code.trim())) {
      setError("code 必须以小写字母开头,只能包含小写字母、数字、下划线");
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && initial) {
        const patch: UpdateRoleInput = {
          name: name.trim(),
          description: description.trim(),
          permission_ids: permIDs,
        };
        await updateRole(initial.id, patch);
      } else {
        const input: CreateRoleInput = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim(),
          permission_ids: permIDs,
        };
        await createRole(input);
      }
      toast.success(isEdit ? "已保存" : "已新建");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const grouped = useMemo(() => groupPermissions(permissions), [permissions]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={isEdit ? `编辑角色 · ${initial?.name}` : "新建角色"}
      description="勾选该角色拥有的权限。被分配此角色的用户将看到对应 Tab 并可执行对应操作。"
      size="lg"
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">角色名</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如:内容编辑"
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">code</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="如:content_editor"
              className="h-8 font-mono text-sm"
              disabled={isSystem}
            />
            {isSystem ? (
              <p className="text-[11px] text-muted-foreground">内置角色 code 不可修改。</p>
            ) : null}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">描述</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="可选,简要说明该角色的用途"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">权限</label>
            <div className="flex gap-1">
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setPermIDs(permissions.map((p) => p.id))
                }
              >
                全选
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setPermIDs([])}
              >
                清空
              </button>
            </div>
          </div>
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 md:grid-cols-3">
            {grouped.map(({ category, items }) => (
              <div key={category} className="rounded-md border bg-card p-2">
                <div className="mb-1 text-[11px] font-medium">
                  {PERMISSION_CATEGORY_LABEL[category]}
                </div>
                <ul className="space-y-1">
                  {items.map((p) => (
                    <li key={p.id}>
                      <label className="flex items-start gap-1.5 text-[11px]">
                        <input
                          type="checkbox"
                          checked={permIDs.includes(p.id)}
                          onChange={() => toggle(p.id)}
                          className="mt-0.5 size-3"
                        />
                        <span className="leading-tight">
                          <span className="block">{p.name}</span>
                          <code className="text-[10px] text-muted-foreground">
                            {p.code}
                          </code>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
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
