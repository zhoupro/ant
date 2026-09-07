package handlers

import (
	"mc/cronjobs"
	"mc/datadb"
	"mc/logicmodels"
	"mc/models"
	"mc/pages"
	"mc/settings"

	"github.com/gin-gonic/gin"
)

type Deps struct {
	Store      *settings.Store
	Manager    *datadb.Manager
	LMStore    *logicmodels.Store
	PagesStore *pages.Store
	CronStore  *cronjobs.Store
	CronRunner *cronjobs.Runner
	CronSched  *cronjobs.Scheduler
}

func Register(r *gin.Engine, deps Deps) {
	uploadDeps := &UploadDeps{Store: deps.Store}
	settingsDeps := &SettingsDeps{
		Store:        deps.Store,
		Manager:      deps.Manager,
		LMStore:      deps.LMStore,
		PagesStore:   deps.PagesStore,
		EditableKeys: map[string]struct{}{
			settings.KeyUploadRoot:    {},
			settings.KeyManagedDBPath: {},
		},
	}
	cronDeps := &cronJobsDeps{
		Store:  deps.CronStore,
		Runner: deps.CronRunner,
		Sched:  deps.CronSched,
	}

	mgr := deps.Manager
	lmStore := deps.LMStore
	pagesStore := deps.PagesStore

	api := r.Group("/api")
	{
		// Auth endpoints — login / me / change-password 不需要权限,
		// 只要登录态;API tokens 与密码管理是登录用户的自助操作。
		api.POST("/auth/login", login)
		api.POST("/auth/logout", logout)
		api.GET("/auth/me", authRequired, me)
		api.POST("/auth/change-password", authRequired, changePassword)

		api.GET("/auth/tokens", authRequired, requirePermission(models.PermViewAPITokens), listAPITokens)
		api.POST("/auth/tokens", authRequired, requirePermission(models.PermViewAPITokens), createAPIToken)
		api.GET("/auth/tokens/:id/plain", authRequired, requirePermission(models.PermViewAPITokens), revealAPIToken)
		api.DELETE("/auth/tokens/:id", authRequired, requirePermission(models.PermViewAPITokens), revokeAPIToken)

		// 文件
		api.POST("/uploads", authRequired, requirePermission(models.PermManageUploads), WithUploadDeps(upload, uploadDeps))
		api.GET("/uploads", authRequired, requirePermission(models.PermViewFiles), WithUploadDeps(listUploads, uploadDeps))
		api.DELETE("/uploads/:id", authRequired, requirePermission(models.PermManageUploads), WithUploadDeps(deleteUpload, uploadDeps))

		// 设置
		api.GET("/settings", authRequired, requirePermission(models.PermViewSettings), WithSettingsDeps(listSettings, settingsDeps))
		api.PUT("/settings", authRequired, requirePermission(models.PermManageSettings), WithSettingsDeps(updateSettings, settingsDeps))

		// 受管数据库状态
		dbfile := api.Group("/dbfile", authRequired, requirePermission(models.PermViewDatabase))
		{
			h := NewDBFileHandler(mgr)
			dbfile.GET("/status", h.status)
		}

		// 表 CRUD
		th := NewTablesHandler(mgr)
		api.GET("/tables", authRequired, requirePermission(models.PermViewDatabase), th.list)
		api.GET("/tables/:name/schema", authRequired, requirePermission(models.PermViewDatabase), th.schema)
		api.GET("/tables/:name/rows", authRequired, requirePermission(models.PermViewDatabase), th.rows)
		api.GET("/tables/:name/rows/:pk", authRequired, requirePermission(models.PermViewDatabase), th.getRow)
		api.POST("/tables/:name/rows", authRequired, requirePermission(models.PermManageDatabase), th.insert)
		api.PUT("/tables/:name/rows/:pk", authRequired, requirePermission(models.PermManageDatabase), th.update)
		api.DELETE("/tables/:name/rows/:pk", authRequired, requirePermission(models.PermManageDatabase), th.delete)
		api.POST("/tables", authRequired, requirePermission(models.PermManageDatabase), th.create)
		api.DELETE("/tables/:name", authRequired, requirePermission(models.PermManageDatabase), th.drop)
		api.POST("/tables/:name/columns", authRequired, requirePermission(models.PermManageDatabase), th.addColumn)
		api.DELETE("/tables/:name/columns/:column", authRequired, requirePermission(models.PermManageDatabase), th.dropColumn)

		// 逻辑模型
		lm := NewLogicModelsHandler(lmStore, mgr)
		api.GET("/models", authRequired, requirePermission(models.PermViewModels), lm.list)
		api.GET("/models/business-types", authRequired, requirePermission(models.PermViewModels), lm.businessTypes)
		api.GET("/models/tables", authRequired, requirePermission(models.PermViewModels), lm.tables)
		api.GET("/models/tables/:name/schema", authRequired, requirePermission(models.PermViewModels), lm.tableSchema)
		api.POST("/models", authRequired, requirePermission(models.PermManageModels), lm.save)
		api.POST("/models/auto", authRequired, requirePermission(models.PermManageModels), lm.autoCreate)
		api.GET("/models/:slug", authRequired, requirePermission(models.PermViewModels), lm.get)
		api.PUT("/models/:slug", authRequired, requirePermission(models.PermManageModels), lm.save)
		api.DELETE("/models/:slug", authRequired, requirePermission(models.PermManageModels), lm.delete)

		// 运行时 CRUD(同逻辑模型权限)
		rt := NewRuntimeHandler(lmStore, mgr)
		api.GET("/runtime/:slug/schema", authRequired, requirePermission(models.PermViewModels), rt.schema)
		api.GET("/runtime/:slug/rows", authRequired, requirePermission(models.PermViewModels), rt.rows)
		api.GET("/runtime/:slug/rows/:pk", authRequired, requirePermission(models.PermViewModels), rt.getRow)
		api.POST("/runtime/:slug/rows", authRequired, requirePermission(models.PermManageModels), rt.insert)
		api.PUT("/runtime/:slug/rows/:pk", authRequired, requirePermission(models.PermManageModels), rt.update)
		api.DELETE("/runtime/:slug/rows/:pk", authRequired, requirePermission(models.PermManageModels), rt.delete)

		// 页面配置
		pg := NewPagesHandler(pagesStore)
		api.GET("/pages", authRequired, requirePermission(models.PermViewPages), pg.list)
		api.GET("/pages/icons", authRequired, requirePermission(models.PermViewPages), pg.icons)
		api.GET("/pages/:id", authRequired, requirePermission(models.PermViewPages), pg.get)
		api.POST("/pages", authRequired, requirePermission(models.PermManagePages), pg.create)
		api.PUT("/pages/:id", authRequired, requirePermission(models.PermManagePages), pg.update)
		api.DELETE("/pages/:id", authRequired, requirePermission(models.PermManagePages), pg.delete)

		// 用户与角色管理 —— 仅 manage_users / manage_roles
		api.GET("/admin-users", authRequired, requirePermission(models.PermManageUsers), listAdminUsers)
		api.GET("/admin-users/:id", authRequired, requirePermission(models.PermManageUsers), getAdminUser)
		api.POST("/admin-users", authRequired, requirePermission(models.PermManageUsers), createAdminUser)
		api.PUT("/admin-users/:id", authRequired, requirePermission(models.PermManageUsers), updateAdminUser)
		api.DELETE("/admin-users/:id", authRequired, requirePermission(models.PermManageUsers), deleteAdminUser)
		api.POST("/admin-users/:id/reset-password", authRequired, requirePermission(models.PermManageUsers), resetAdminUserPassword)

		api.GET("/regular-users", authRequired, requirePermission(models.PermManageUsers), listRegularUsers)
		api.GET("/regular-users/:id", authRequired, requirePermission(models.PermManageUsers), getRegularUser)
		api.POST("/regular-users", authRequired, requirePermission(models.PermManageUsers), createRegularUser)
		api.PUT("/regular-users/:id", authRequired, requirePermission(models.PermManageUsers), updateRegularUser)
		api.DELETE("/regular-users/:id", authRequired, requirePermission(models.PermManageUsers), deleteRegularUser)
		api.POST("/regular-users/:id/reset-password", authRequired, requirePermission(models.PermManageUsers), resetRegularUserPassword)

		api.GET("/roles", authRequired, requirePermission(models.PermManageRoles), listRoles)
		api.GET("/roles/:id", authRequired, requirePermission(models.PermManageRoles), getRole)
		api.POST("/roles", authRequired, requirePermission(models.PermManageRoles), createRole)
		api.PUT("/roles/:id", authRequired, requirePermission(models.PermManageRoles), updateRole)
		api.DELETE("/roles/:id", authRequired, requirePermission(models.PermManageRoles), deleteRole)

		api.GET("/permissions", authRequired, requirePermission(models.PermManageRoles), listPermissions)

		// 定时任务 —— 整套 CRUD 与运行历史/日志查看
		RegisterCronJobsRoutes(api, cronDeps)
	}

	r.Match([]string{"GET", "HEAD"}, "/uploads/:id", authRequired, requirePermission(models.PermViewFiles), WithUploadDeps(serveUpload, uploadDeps))
}
