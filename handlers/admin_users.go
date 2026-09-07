package handlers

import (
	"errors"
	"net/http"
	"strings"

	"mc/db"
	"mc/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// listAdminUsers GET /api/admin-users
func listAdminUsers(c *gin.Context) {
	var rows []models.AdminUser
	if err := db.DB.Order("id asc").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for i := range rows {
		out = append(out, adminUserPayload(&rows[i]))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func getAdminUser(c *gin.Context) {
	id := c.Param("id")
	var u models.AdminUser
	if err := db.DB.First(&u, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": adminUserPayload(&u)})
}

type adminUserInput struct {
	Username string  `json:"username"`
	Password string  `json:"password"`
	RoleIDs  []uint  `json:"role_ids"`
	MustChgP *bool   `json:"must_change_password"`
}

func createAdminUser(c *gin.Context) {
	var in adminUserInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	username := strings.TrimSpace(in.Username)
	if len(username) < 2 || len(username) > 64 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "用户名长度需在 2~64 之间"})
		return
	}
	if len(in.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "密码至少 6 位"})
		return
	}
	var exist models.AdminUser
	if err := db.DB.Where("username = ?", username).First(&exist).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "用户名已被占用"})
		return
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	mustChange := true
	if in.MustChgP != nil {
		mustChange = *in.MustChgP
	}
	admin := models.AdminUser{
		Username:           username,
		PasswordHash:       string(hash),
		MustChangePassword: mustChange,
	}
	if err := db.DB.Create(&admin).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := syncAdminUserRoles(admin.ID, in.RoleIDs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": adminUserPayload(&admin)})
}

func updateAdminUser(c *gin.Context) {
	id := c.Param("id")
	var u models.AdminUser
	if err := db.DB.First(&u, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var in struct {
		Username string `json:"username"`
		RoleIDs  []uint `json:"role_ids"`
		MustChgP *bool  `json:"must_change_password"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	newName := strings.TrimSpace(in.Username)
	if newName != "" && newName != u.Username {
		if len(newName) < 2 || len(newName) > 64 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "用户名长度需在 2~64 之间"})
			return
		}
		var exist models.AdminUser
		if err := db.DB.Where("username = ? AND id <> ?", newName, u.ID).First(&exist).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "用户名已被占用"})
			return
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		u.Username = newName
	}
	if in.MustChgP != nil {
		u.MustChangePassword = *in.MustChgP
	}
	if err := db.DB.Save(&u).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if in.RoleIDs != nil {
		if err := syncAdminUserRoles(u.ID, in.RoleIDs); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": adminUserPayload(&u)})
}

func deleteAdminUser(c *gin.Context) {
	id := c.Param("id")
	p := currentPrincipal(c)
	if p.user.UserKind == models.UserKindAdmin && p.user.ID == toUint(id) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不能删除当前登录的管理员"})
		return
	}
	var u models.AdminUser
	if err := db.DB.First(&u, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := db.DB.Where("admin_user_id = ?", u.ID).Delete(&models.AdminUserRole{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := db.DB.Delete(&u).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "id": u.ID}})
}

func resetAdminUserPassword(c *gin.Context) {
	id := c.Param("id")
	var u models.AdminUser
	if err := db.DB.First(&u, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var in struct {
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(in.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "密码至少 6 位"})
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	u.PasswordHash = string(hash)
	u.MustChangePassword = true
	if err := db.DB.Save(&u).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "id": u.ID}})
}

func adminUserPayload(u *models.AdminUser) gin.H {
	roleIDs := roleIDsForAdmin(u.ID)
	roleNames := roleNamesForIDs(roleIDs)
	return gin.H{
		"id":                   u.ID,
		"username":             u.Username,
		"user_kind":            models.UserKindAdmin,
		"must_change_password": u.MustChangePassword,
		"role_ids":             roleIDs,
		"role_names":           roleNames,
		"created_at":           u.CreatedAt,
		"updated_at":           u.UpdatedAt,
	}
}

func syncAdminUserRoles(adminID uint, roleIDs []uint) error {
	roleIDs = dedupUint(roleIDs)
	if len(roleIDs) > 0 {
		var count int64
		if err := db.DB.Model(&models.Role{}).Where("id IN ?", roleIDs).Count(&count).Error; err != nil {
			return err
		}
		if int(count) != len(roleIDs) {
			return errors.New("部分角色不存在")
		}
	}
	if err := db.DB.Where("admin_user_id = ?", adminID).Delete(&models.AdminUserRole{}).Error; err != nil {
		return err
	}
	for _, rid := range roleIDs {
		if err := db.DB.Create(&models.AdminUserRole{AdminUserID: adminID, RoleID: rid}).Error; err != nil {
			return err
		}
	}
	return nil
}

func dedupUint(in []uint) []uint {
	seen := map[uint]struct{}{}
	out := make([]uint, 0, len(in))
	for _, v := range in {
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

func toUint(s string) uint {
	var n uint
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + uint(r-'0')
	}
	return n
}
