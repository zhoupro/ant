package handlers

import "github.com/gin-gonic/gin"

func Register(r *gin.Engine) {
	api := r.Group("/api")
	{
		api.POST("/auth/login", login)
		api.POST("/auth/logout", logout)
		api.GET("/auth/me", authRequired, me)
		api.POST("/auth/change-password", authRequired, changePassword)
	}
}
