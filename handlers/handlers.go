package handlers

import (
	"mc/datadb"
	"mc/logicmodels"
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
	lmStore := logicmodels.NewStore()

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

		lm := NewLogicModelsHandler(lmStore, mgr)
		api.GET("/models", authRequired, lm.list)
		api.POST("/models", authRequired, lm.save)
		api.GET("/models/business-types", authRequired, lm.businessTypes)
		api.GET("/models/tables", authRequired, lm.tables)
		api.GET("/models/tables/:name/schema", authRequired, lm.tableSchema)
		api.GET("/models/:slug", authRequired, lm.get)
		api.PUT("/models/:slug", authRequired, lm.save)
		api.DELETE("/models/:slug", authRequired, lm.delete)

		rt := NewRuntimeHandler(lmStore, mgr)
		api.GET("/runtime/:slug/schema", authRequired, rt.schema)
		api.GET("/runtime/:slug/rows", authRequired, rt.rows)
		api.GET("/runtime/:slug/rows/:pk", authRequired, rt.getRow)
		api.POST("/runtime/:slug/rows", authRequired, rt.insert)
		api.PUT("/runtime/:slug/rows/:pk", authRequired, rt.update)
		api.DELETE("/runtime/:slug/rows/:pk", authRequired, rt.delete)
	}

	r.Match([]string{"GET", "HEAD"}, "/uploads/:id", WithUploadDeps(serveUpload, uploadDeps))
}