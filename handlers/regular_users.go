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

// listRegularUsers GET /api/regular-users
func listRegularUsers(c *gin.Context) {
	var rows []models.RegularUser
	if err := db.DB.Order("id asc").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for i := range rows {
		out = append(out, regularUserPayload(&rows[i]))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func getRegularUser(c *gin.Context) {
	id := c.Param("id")
	var u models.RegularUser
	if err := db.DB.First(&u, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": regularUserPayload(&u)})
}

type regularUserInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
	RoleIDs  []uint `json:"role_ids"`
	Disabled *bool  `json:"disabled"`
	MustChgP *bool  `json:"must_change_password"`
}

func createRegularUser(c *gin.Context) {
	var in regularUserInput
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
	var exist models.RegularUser
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
	u := models.RegularUser{
		Username:           username,
		PasswordHash:       string(hash),
		MustChangePassword: mustChange,
	}
	if in.Disabled != nil {
		u.Disabled = *in.Disabled
	}
	if err := db.DB.Create(&u).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := syncRegularUserRoles(u.ID, in.RoleIDs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": regularUserPayload(&u)})
}

func updateRegularUser(c *gin.Context) {
	id := c.Param("id")
	var u models.RegularUser
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
		Disabled *bool  `json:"disabled"`
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
		var exist models.RegularUser
		if err := db.DB.Where("username = ? AND id <> ?", newName, u.ID).First(&exist).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "用户名已被占用"})
			return
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		u.Username = newName
	}
	if in.Disabled != nil {
		u.Disabled = *in.Disabled
	}
	if in.MustChgP != nil {
		u.MustChangePassword = *in.MustChgP
	}
	if err := db.DB.Save(&u).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if in.RoleIDs != nil {
		if err := syncRegularUserRoles(u.ID, in.RoleIDs); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": regularUserPayload(&u)})
}

func deleteRegularUser(c *gin.Context) {
	id := c.Param("id")
	var u models.RegularUser
	if err := db.DB.First(&u, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := db.DB.Where("regular_user_id = ?", u.ID).Delete(&models.RegularUserRole{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := db.DB.Delete(&u).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "id": u.ID}})
}

func resetRegularUserPassword(c *gin.Context) {
	id := c.Param("id")
	var u models.RegularUser
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

func regularUserPayload(u *models.RegularUser) gin.H {
	roleIDs := roleIDsForRegular(u.ID)
	roleNames := roleNamesForIDs(roleIDs)
	return gin.H{
		"id":                   u.ID,
		"username":             u.Username,
		"user_kind":            models.UserKindRegular,
		"must_change_password": u.MustChangePassword,
		"disabled":             u.Disabled,
		"role_ids":             roleIDs,
		"role_names":           roleNames,
		"created_at":           u.CreatedAt,
		"updated_at":           u.UpdatedAt,
	}
}

func syncRegularUserRoles(userID uint, roleIDs []uint) error {
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
	if err := db.DB.Where("regular_user_id = ?", userID).Delete(&models.RegularUserRole{}).Error; err != nil {
		return err
	}
	for _, rid := range roleIDs {
		if err := db.DB.Create(&models.RegularUserRole{RegularUserID: userID, RoleID: rid}).Error; err != nil {
			return err
		}
	}
	return nil
}

func roleNamesForIDs(ids []uint) []string {
	if len(ids) == 0 {
		return []string{}
	}
	var rows []models.Role
	if err := db.DB.Where("id IN ?", ids).Find(&rows).Error; err != nil {
		return []string{}
	}
	byID := make(map[uint]string, len(rows))
	for _, r := range rows {
		byID[r.ID] = r.Name
	}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if name, ok := byID[id]; ok {
			out = append(out, name)
		}
	}
	return out
}
