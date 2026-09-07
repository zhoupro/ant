package models

import "time"

// PermissionCode 权限编码常量,与前端 / 路由共用。
type PermissionCode string

const (
	// 查看类权限 —— 控制 Tab 可见性
	PermViewHome      PermissionCode = "view_home"
	PermViewFiles     PermissionCode = "view_files"
	PermViewDatabase  PermissionCode = "view_database"
	PermViewModels    PermissionCode = "view_models"
	PermViewPages     PermissionCode = "view_pages"
	PermViewAPITokens PermissionCode = "view_api_tokens"
	PermViewSettings  PermissionCode = "view_settings"
PermViewCronJobs  PermissionCode = "view_cron_jobs"
	PermViewLogs      PermissionCode = "view_logs"

	// 管理类权限 —— 隐含查看权限,允许在功能页内写入
	PermManageUploads  PermissionCode = "manage_uploads"
	PermManageDatabase PermissionCode = "manage_database"
	PermManageModels   PermissionCode = "manage_models"
	PermManagePages    PermissionCode = "manage_pages"
	PermManageSettings PermissionCode = "manage_settings"
PermManageCronJobs PermissionCode = "manage_cron_jobs"
	PermManageLogs     PermissionCode = "manage_logs"

	// 平台管理 —— 仅超级管理员默认拥有
	PermManageUsers PermissionCode = "manage_users"
	PermManageRoles PermissionCode = "manage_roles"
)

// AllPermissions 列出系统所有可用权限,启动时同步到 permissions 表。
// 顺序决定前端权限矩阵的展示顺序。
var AllPermissions = []struct {
	Code        PermissionCode
	Name        string
	Description string
	Category    string
}{
	{PermViewHome, "查看首页", "访问首页与已配置的页面", "view"},
	{PermViewFiles, "查看文件", "查看上传的文件列表", "view"},
	{PermViewDatabase, "查看数据库", "浏览受管数据库的表与数据", "view"},
	{PermViewModels, "查看逻辑模型", "查看已配置的逻辑模型", "view"},
	{PermViewPages, "查看页面配置", "查看底部导航与页面配置", "view"},
	{PermViewAPITokens, "查看 API 令牌", "查看 API 令牌列表", "view"},
	{PermViewSettings, "查看设置", "查看设置中心", "view"},
{PermViewCronJobs, "查看定时任务", "查看定时任务及其运行历史与日志", "view"},
	{PermViewLogs, "查看日志", "查看系统日志列表与详情", "view"},

	{PermManageUploads, "上传/删除文件", "上传新文件、删除已有文件", "manage"},
	{PermManageDatabase, "管理数据库", "新建/删除表,增删列,增删改查数据", "manage"},
	{PermManageModels, "管理逻辑模型", "新建/编辑/删除逻辑模型", "manage"},
	{PermManagePages, "管理页面", "新建/编辑/删除页面与底部导航", "manage"},
	{PermManageSettings, "修改设置", "修改上传目录、受管数据库路径等系统设置", "manage"},
{PermManageCronJobs, "管理定时任务", "新建/编辑/启用/停用/手动触发定时任务", "manage"},
	{PermManageLogs, "管理日志", "新建 / 删除日志条目,清空日志", "manage"},

	{PermManageUsers, "管理用户", "新建/编辑/删除管理员与普通用户", "admin"},
	{PermManageRoles, "管理角色", "新建/编辑/删除角色并分配权限", "admin"},
}

// Permission 系统内置 / 未来扩展的权限点。
type Permission struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Code        PermissionCode `gorm:"size:64;uniqueIndex;not null" json:"code"`
	Name        string         `gorm:"size:64;not null" json:"name"`
	Description string         `gorm:"size:255" json:"description"`
	Category    string         `gorm:"size:32;not null;index" json:"category"`
	CreatedAt   time.Time      `json:"created_at"`
}

func (Permission) TableName() string { return "permissions" }

// Role 角色。
type Role struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Code        string    `gorm:"size:64;uniqueIndex;not null" json:"code"`
	Name        string    `gorm:"size:64;not null" json:"name"`
	Description string    `gorm:"size:255" json:"description"`
	IsSystem    bool      `gorm:"not null;default:false" json:"is_system"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (Role) TableName() string { return "roles" }

const (
	RoleCodeSuperAdmin  = "super_admin"
	RoleCodeRegularUser = "regular_user"
)

// RolePermission 角色 ↔ 权限 多对多。
type RolePermission struct {
	RoleID       uint `gorm:"primaryKey" json:"role_id"`
	PermissionID uint `gorm:"primaryKey" json:"permission_id"`
}

func (RolePermission) TableName() string { return "role_permissions" }

// AdminUserRole 管理员 ↔ 角色 多对多。
// 使用独立连接表是因为 AdminUser 与 RegularUser 两表 ID 可能重合,需要按 UserKind 区分。
type AdminUserRole struct {
	AdminUserID uint `gorm:"primaryKey" json:"admin_user_id"`
	RoleID      uint `gorm:"primaryKey;index" json:"role_id"`
}

func (AdminUserRole) TableName() string { return "admin_user_roles" }

// RegularUserRole 普通用户 ↔ 角色 多对多。
type RegularUserRole struct {
	RegularUserID uint `gorm:"primaryKey" json:"regular_user_id"`
	RoleID        uint `gorm:"primaryKey;index" json:"role_id"`
}

func (RegularUserRole) TableName() string { return "regular_user_roles" }

// PermissionCodes 解析一组 RolePermission 关联的 PermissionIDs 为编码集合。
func PermissionCodes(perms []Permission) []string {
	out := make([]string, 0, len(perms))
	for _, p := range perms {
		out = append(out, string(p.Code))
	}
	return out
}
