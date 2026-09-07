package handlers

import (
	"net/http"

	"mc/db"
	"mc/models"

	"github.com/gin-gonic/gin"
)

// listPermissions GET /api/permissions
// 返回系统内置 + 自定义权限。前端用来渲染权限矩阵。
func listPermissions(c *gin.Context) {
	var rows []models.Permission
	if err := db.DB.Order("category asc, id asc").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for _, p := range rows {
		out = append(out, gin.H{
			"id":          p.ID,
			"code":        p.Code,
			"name":        p.Name,
			"description": p.Description,
			"category":    p.Category,
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}
