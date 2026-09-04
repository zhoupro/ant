package handlers

import (
	"mc/settings"

	"github.com/gin-gonic/gin"
)

type Deps struct {
	Store *settings.Store
}

func Register(r *gin.Engine, deps Deps) {
	uploadDeps := &UploadDeps{Store: deps.Store}
	settingsDeps := &SettingsDeps{
		Store: deps.Store,
		EditableKeys: map[string]struct{}{
			settings.KeyUploadRoot: {},
		},
	}

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
	}

	r.Match([]string{"GET", "HEAD"}, "/uploads/:id", WithUploadDeps(serveUpload, uploadDeps))
}
