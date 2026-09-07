package handlers

import (
	"errors"
	"net/http"
	"regexp"
	"strings"

	"mc/db"
	"mc/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var roleCodeRe = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)

// listRoles GET /api/roles
func listRoles(c *gin.Context) {
	var rows []models.Role
	if err := db.DB.Order("is_system desc, id asc").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for i := range rows {
		out = append(out, rolePayload(&rows[i]))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func getRole(c *gin.Context) {
	id := c.Param("id")
	var r models.Role
	if err := db.DB.First(&r, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "角色不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rolePayload(&r)})
}

type roleInput struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
	PermissionIDs []uint `json:"permission_ids"`
}

func createRole(c *gin.Context) {
	var in roleInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	code := strings.TrimSpace(in.Code)
	name := strings.TrimSpace(in.Name)
	if !roleCodeRe.MatchString(code) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code 必须以小写字母开头,只能包含小写字母、数字、下划线"})
		return
	}
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "角色名不能为空"})
		return
	}
	var exist models.Role
	if err := db.DB.Where("code = ?", code).First(&exist).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "角色 code 已存在"})
		return
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	r := models.Role{
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(in.Description),
		IsSystem:    false,
	}
	if err := db.DB.Create(&r).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := syncRolePermissions(r.ID, in.PermissionIDs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rolePayload(&r)})
}

func updateRole(c *gin.Context) {
	id := c.Param("id")
	var r models.Role
	if err := db.DB.First(&r, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "角色不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var in struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		PermissionIDs []uint `json:"permission_ids"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if r.IsSystem {
		// Built-in role: name/description editable, code locked.
		name := strings.TrimSpace(in.Name)
		if name != "" {
			r.Name = name
		}
		if in.Description != "" {
			r.Description = strings.TrimSpace(in.Description)
		}
		if err := db.DB.Model(&r).Updates(map[string]any{
			"name":        r.Name,
			"description": r.Description,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		name := strings.TrimSpace(in.Name)
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "角色名不能为空"})
			return
		}
		r.Name = name
		r.Description = strings.TrimSpace(in.Description)
		if err := db.DB.Save(&r).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	if in.PermissionIDs != nil {
		if err := syncRolePermissions(r.ID, in.PermissionIDs); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": rolePayload(&r)})
}

func deleteRole(c *gin.Context) {
	id := c.Param("id")
	var r models.Role
	if err := db.DB.First(&r, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "角色不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if r.IsSystem {
		c.JSON(http.StatusBadRequest, gin.H{"error": "内置角色不可删除"})
		return
	}
	if err := db.DB.Where("role_id = ?", r.ID).Delete(&models.RolePermission{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := db.DB.Where("role_id = ?", r.ID).Delete(&models.AdminUserRole{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := db.DB.Where("role_id = ?", r.ID).Delete(&models.RegularUserRole{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := db.DB.Delete(&r).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "id": r.ID}})
}

func rolePayload(r *models.Role) gin.H {
	permIDs := permissionIDsForRole(r.ID)
	return gin.H{
		"id":             r.ID,
		"code":           r.Code,
		"name":           r.Name,
		"description":    r.Description,
		"is_system":      r.IsSystem,
		"permission_ids": permIDs,
		"created_at":     r.CreatedAt,
		"updated_at":     r.UpdatedAt,
	}
}

func permissionIDsForRole(roleID uint) []uint {
	var ids []uint
	db.DB.Model(&models.RolePermission{}).
		Where("role_id = ?", roleID).
		Pluck("permission_id", &ids)
	return ids
}

func syncRolePermissions(roleID uint, permIDs []uint) error {
	permIDs = dedupUint(permIDs)
	if len(permIDs) > 0 {
		var count int64
		if err := db.DB.Model(&models.Permission{}).Where("id IN ?", permIDs).Count(&count).Error; err != nil {
			return err
		}
		if int(count) != len(permIDs) {
			return errors.New("部分权限不存在")
		}
	}
	if err := db.DB.Where("role_id = ?", roleID).Delete(&models.RolePermission{}).Error; err != nil {
		return err
	}
	for _, pid := range permIDs {
		if err := db.DB.Create(&models.RolePermission{RoleID: roleID, PermissionID: pid}).Error; err != nil {
			return err
		}
	}
	return nil
}
