import type {
  PermissionCategory,
  PermissionItem,
} from "@/features/auth/types";

export const PERMISSION_CATEGORY_LABEL: Record<PermissionCategory, string> = {
  view: "查看功能",
  manage: "管理功能",
  admin: "平台管理",
};

export const PERMISSION_CATEGORY_DESCRIPTION: Record<PermissionCategory, string> = {
  view: "只读访问对应 Tab 和数据",
  manage: "在对应 Tab 内增删改",
  admin: "用户与角色等系统级管理",
};

export function groupPermissions(
  perms: PermissionItem[],
): { category: PermissionCategory; items: PermissionItem[] }[] {
  const order: PermissionCategory[] = ["view", "manage", "admin"];
  const buckets = new Map<PermissionCategory, PermissionItem[]>();
  for (const p of perms) {
    const list = buckets.get(p.category) ?? [];
    list.push(p);
    buckets.set(p.category, list);
  }
  return order
    .filter((c) => buckets.has(c))
    .map((c) => ({ category: c, items: buckets.get(c)! }));
}

export interface TabPermissionSpec {
  key: string;
  label: string;
  permission: string;
}

export const TAB_PERMISSIONS: TabPermissionSpec[] = [
  { key: "home", label: "首页", permission: "view_home" },
  { key: "files", label: "文件", permission: "view_files" },
  { key: "db", label: "数据库", permission: "view_database" },
  { key: "models", label: "逻辑模型", permission: "view_models" },
  { key: "pages", label: "页面", permission: "view_pages" },
  { key: "cron", label: "定时任务", permission: "view_cron_jobs" },
  { key: "api", label: "API", permission: "view_api_tokens" },
  { key: "logs", label: "日志", permission: "view_logs" },
  { key: "settings", label: "设置", permission: "view_settings" },
  { key: "users", label: "用户", permission: "manage_users" },
  { key: "roles", label: "角色", permission: "manage_roles" },
];
