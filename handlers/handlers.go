package handlers

import (
	"mc/datadb"
	"mc/settings"

	"github.com/gin-gonic/gin"
)

type Deps struct {
	Store   *settings.Store
	Manager *datadb.Manager
}

func Register(r *gin.Engine, deps Deps) {
	uploadDeps := &UploadDeps{Store: deps.Store}
	settingsDeps := &SettingsDeps{
		Store:   deps.Store,
		Manager: deps.Manager,
		EditableKeys: map[string]struct{}{
			settings.KeyUploadRoot:    {},
			settings.KeyManagedDBPath: {},
		},
	}

	mgr := deps.Manager

	api := r.Group("/api")
	{
		api.POST("/auth/login", login)
		api.POST("/auth/logout", logout)
		api.GET("/auth/me", authRequired, me)
		api.POST("/auth/change-password", authRequired, changePassword)

		api.POST("/uploads", authRequired, WithUploadDeps(upload, uploadDeps))
		api.GET("/uploads", authRequired, WithUploadDeps(listUploads, uploadDeps))
		api.DELETE("/uploads/:id", authRequired, WithUploadDeps(deleteUpload, uploadDeps))

		api.GET("/settings", authRequired, WithSettingsDeps(listSettings, settingsDeps))
		api.PUT("/settings", authRequired, WithSettingsDeps(updateSettings, settingsDeps))

		dbfile := api.Group("/dbfile", authRequired)
		{
			h := NewDBFileHandler(mgr)
			dbfile.GET("/status", h.status)
		}

		th := NewTablesHandler(mgr)
		api.GET("/tables", authRequired, th.list)
		api.GET("/tables/:name/schema", authRequired, th.schema)
		api.GET("/tables/:name/rows", authRequired, th.rows)
		api.GET("/tables/:name/rows/:pk", authRequired, th.getRow)
		api.POST("/tables/:name/rows", authRequired, th.insert)
		api.PUT("/tables/:name/rows/:pk", authRequired, th.update)
		api.DELETE("/tables/:name/rows/:pk", authRequired, th.delete)
		api.POST("/tables", authRequired, th.create)
		api.DELETE("/tables/:name", authRequired, th.drop)
		api.POST("/tables/:name/columns", authRequired, th.addColumn)
	}

	r.Match([]string{"GET", "HEAD"}, "/uploads/:id", WithUploadDeps(serveUpload, uploadDeps))
}