package handlers

import (
	"mc/datadb"

	"github.com/gin-gonic/gin"
)

func Register(r *gin.Engine) {
	mgr := datadb.NewManager()

	api := r.Group("/api")
	{
		api.POST("/auth/login", login)
		api.POST("/auth/logout", logout)
		api.GET("/auth/me", authRequired, me)
		api.POST("/auth/change-password", authRequired, changePassword)

		dbfile := api.Group("/dbfile", authRequired)
		{
			h := NewDBFileHandler(mgr)
			dbfile.GET("/status", h.status)
			dbfile.POST("/upload", h.upload)
			dbfile.POST("/load", h.load)
			dbfile.POST("/unload", h.unload)
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
}