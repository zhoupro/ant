package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"mc/db"
	"mc/models"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const (
	sessionCookie = "mc_session"
	sessionTTL    = 7 * 24 * time.Hour
)

type loginInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type changePasswordInput struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
	NewUsername string `json:"new_username"`
}

// CurrentUser 把两种用户类型 + 权限合并成统一结构返回给前端。
// 内部用 *principal 在 handler 间传递。
type CurrentUser struct {
	ID                 uint             `json:"id"`
	Username           string           `json:"username"`
	UserKind           models.UserKind  `json:"user_kind"`
	IsSuperAdmin       bool             `json:"is_super_admin"`
	MustChangePassword bool             `json:"must_change_password"`
	Disabled           bool             `json:"disabled"`
	Permissions        []string         `json:"permissions"`
	RoleIDs            []uint           `json:"role_ids,omitempty"`
	CreatedAt          time.Time        `json:"created_at"`
	UpdatedAt          time.Time        `json:"updated_at"`
}

type principal struct {
	user *CurrentUser
}

const principalKey = "mcPrincipal"

func login(c *gin.Context) {
	var in loginInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	in.Username = strings.TrimSpace(in.Username)
	if in.Username == "" || in.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "用户名和密码必填"})
		return
	}

	principal, err := authenticateByPassword(in.Username, in.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	token, err := newToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	sess := models.Session{
		Token:     token,
		UserID:    principal.ID,
		UserKind:  principal.UserKind,
		ExpiresAt: time.Now().Add(sessionTTL),
	}
	if err := db.DB.Create(&sess).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(sessionCookie, token, int(sessionTTL.Seconds()), "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"data": principal})
}

func logout(c *gin.Context) {
	if token, err := c.Cookie(sessionCookie); err == nil && token != "" {
		db.DB.Where("token = ?", token).Delete(&models.Session{})
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(sessionCookie, "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true}})
}

func me(c *gin.Context) {
	p := currentPrincipal(c)
	if p == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": p.user})
}

func changePassword(c *gin.Context) {
	p := currentPrincipal(c)
	if p == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	var in changePasswordInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.OldPassword == "" || in.NewPassword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写旧密码和新密码"})
		return
	}
	if len(in.NewPassword) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "新密码至少 6 位"})
		return
	}
	if in.OldPassword == in.NewPassword {
		c.JSON(http.StatusBadRequest, gin.H{"error": "新密码不能与旧密码相同"})
		return
	}

	hash, currentUsername, err := loadPasswordHash(p.user.UserKind, p.user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.OldPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "旧密码错误"})
		return
	}

	newUsername := strings.TrimSpace(in.NewUsername)
	if newUsername != "" && newUsername != currentUsername {
		if len(newUsername) < 2 || len(newUsername) > 64 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "用户名长度需在 2~64 之间"})
			return
		}
		if err := assertUsernameAvailable(p.user.UserKind, p.user.ID, newUsername); err != nil {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		if err := updateUsername(p.user.UserKind, p.user.ID, newUsername); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		p.user.Username = newUsername
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(in.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := updatePasswordHash(p.user.UserKind, p.user.ID, string(newHash), false); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	p.user.MustChangePassword = false
	c.JSON(http.StatusOK, gin.H{"data": p.user})
}

func authRequired(c *gin.Context) {
	if p := loadPrincipal(c); p != nil {
		c.Set(principalKey, p)
		c.Next()
		return
	}
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
}

// requirePermission 校验当前用户拥有指定权限。超级管理员恒通过。
// 仅当 permission 非空时校验,空字符串表示只要登录即可。
func requirePermission(permission models.PermissionCode) gin.HandlerFunc {
	return func(c *gin.Context) {
		p := currentPrincipal(c)
		if p == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
			return
		}
		if permission == "" {
			c.Next()
			return
		}
		if !p.user.IsSuperAdmin && !hasPermission(p.user.Permissions, permission) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "没有访问该功能的权限"})
			return
		}
		c.Next()
	}
}

func hasPermission(perms []string, want models.PermissionCode) bool {
	for _, p := range perms {
		if p == string(want) {
			return true
		}
	}
	return false
}

// loadPrincipal 从 cookie 或 Bearer token 解析当前用户,包含权限。
func loadPrincipal(c *gin.Context) *principal {
	if cookieToken, err := c.Cookie(sessionCookie); err == nil && cookieToken != "" {
		var sess models.Session
		if err := db.DB.Where("token = ?", cookieToken).First(&sess).Error; err == nil {
			if time.Now().After(sess.ExpiresAt) {
				db.DB.Delete(&sess)
			} else if u, err := loadUserByKind(sess.UserKind, sess.UserID); err == nil {
				return &principal{user: u}
			}
		}
	}
	if h := c.GetHeader("Authorization"); h != "" {
		const prefix = "Bearer "
		if len(h) > len(prefix) && strings.EqualFold(h[:len(prefix)], prefix) {
			raw := strings.TrimSpace(h[len(prefix):])
			if raw == "" {
				return nil
			}
			sum := sha256.Sum256([]byte(raw))
			hash := hex.EncodeToString(sum[:])
			var tok models.APIToken
			if err := db.DB.Where("token_hash = ?", hash).First(&tok).Error; err != nil {
				return nil
			}
			if tok.RevokedAt != nil {
				return nil
			}
			if tok.ExpiresAt != nil && time.Now().After(*tok.ExpiresAt) {
				return nil
			}
			if u, err := loadUserByKind(tok.UserKind, tok.UserID); err == nil {
				now := time.Now()
				db.DB.Model(&tok).Update("last_used_at", &now)
				return &principal{user: u}
			}
		}
	}
	return nil
}

func currentPrincipal(c *gin.Context) *principal {
	if v, ok := c.Get(principalKey); ok {
		if p, ok := v.(*principal); ok {
			return p
		}
	}
	return nil
}

// loadPrincipalFromToken 直接根据 token 字符串构造 principal,用于脚本化场景。
func loadPrincipalFromToken(token string) (*principal, error) {
	var sess models.Session
	if err := db.DB.Where("token = ?", token).First(&sess).Error; err != nil {
		return nil, err
	}
	if time.Now().After(sess.ExpiresAt) {
		return nil, errors.New("session expired")
	}
	u, err := loadUserByKind(sess.UserKind, sess.UserID)
	if err != nil {
		return nil, err
	}
	return &principal{user: u}, nil
}

func authenticateByPassword(username, password string) (*CurrentUser, error) {
	var admin models.AdminUser
	if err := db.DB.Where("username = ?", username).First(&admin).Error; err == nil {
		if err := bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(password)); err != nil {
			return nil, err
		}
		p, err := buildPrincipalFromAdmin(&admin)
		if err != nil {
			return nil, err
		}
		return p, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	var regular models.RegularUser
	if err := db.DB.Where("username = ?", username).First(&regular).Error; err != nil {
		return nil, err
	}
	if regular.Disabled {
		return nil, errors.New("disabled")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(regular.PasswordHash), []byte(password)); err != nil {
		return nil, err
	}
	return buildPrincipalFromRegular(&regular)
}

func loadUserByKind(kind models.UserKind, id uint) (*CurrentUser, error) {
	switch kind {
	case models.UserKindAdmin:
		var admin models.AdminUser
		if err := db.DB.First(&admin, id).Error; err != nil {
			return nil, err
		}
		return buildPrincipalFromAdmin(&admin)
	case models.UserKindRegular:
		var regular models.RegularUser
		if err := db.DB.First(&regular, id).Error; err != nil {
			return nil, err
		}
		return buildPrincipalFromRegular(&regular)
	}
	return nil, errors.New("unknown user kind")
}

func buildPrincipalFromAdmin(admin *models.AdminUser) (*CurrentUser, error) {
	roleIDs := roleIDsForAdmin(admin.ID)
	perms, err := permissionsForRoleIDs(roleIDs)
	if err != nil {
		return nil, err
	}
	isSuper := false
	for _, rid := range roleIDs {
		if isSuperAdminRole(rid) {
			isSuper = true
			break
		}
	}
	return &CurrentUser{
		ID:                 admin.ID,
		Username:           admin.Username,
		UserKind:           models.UserKindAdmin,
		IsSuperAdmin:       isSuper,
		MustChangePassword: admin.MustChangePassword,
		Permissions:        perms,
		RoleIDs:            roleIDs,
		CreatedAt:          admin.CreatedAt,
		UpdatedAt:          admin.UpdatedAt,
	}, nil
}

func buildPrincipalFromRegular(regular *models.RegularUser) (*CurrentUser, error) {
	roleIDs := roleIDsForRegular(regular.ID)
	perms, err := permissionsForRoleIDs(roleIDs)
	if err != nil {
		return nil, err
	}
	return &CurrentUser{
		ID:                 regular.ID,
		Username:           regular.Username,
		UserKind:           models.UserKindRegular,
		IsSuperAdmin:       false,
		MustChangePassword: regular.MustChangePassword,
		Disabled:           regular.Disabled,
		Permissions:        perms,
		RoleIDs:            roleIDs,
		CreatedAt:          regular.CreatedAt,
		UpdatedAt:          regular.UpdatedAt,
	}, nil
}

func roleIDsForAdmin(id uint) []uint {
	var ids []uint
	db.DB.Model(&models.AdminUserRole{}).Where("admin_user_id = ?", id).Pluck("role_id", &ids)
	return ids
}

func roleIDsForRegular(id uint) []uint {
	var ids []uint
	db.DB.Model(&models.RegularUserRole{}).Where("regular_user_id = ?", id).Pluck("role_id", &ids)
	return ids
}

func permissionsForRoleIDs(roleIDs []uint) ([]string, error) {
	if len(roleIDs) == 0 {
		return []string{}, nil
	}
	var codes []string
	err := db.DB.
		Table("permissions").
		Joins("JOIN role_permissions rp ON rp.permission_id = permissions.id").
		Where("rp.role_id IN ?", roleIDs).
		Distinct("permissions.code").
		Pluck("permissions.code", &codes).Error
	if err != nil {
		return nil, err
	}
	if codes == nil {
		codes = []string{}
	}
	return codes, nil
}

func isSuperAdminRole(id uint) bool {
	var role models.Role
	if err := db.DB.First(&role, id).Error; err != nil {
		return false
	}
	return role.Code == models.RoleCodeSuperAdmin
}

func loadPasswordHash(kind models.UserKind, id uint) (hash, username string, err error) {
	switch kind {
	case models.UserKindAdmin:
		var admin models.AdminUser
		if err := db.DB.First(&admin, id).Error; err != nil {
			return "", "", err
		}
		return admin.PasswordHash, admin.Username, nil
	case models.UserKindRegular:
		var regular models.RegularUser
		if err := db.DB.First(&regular, id).Error; err != nil {
			return "", "", err
		}
		return regular.PasswordHash, regular.Username, nil
	}
	return "", "", errors.New("unknown user kind")
}

func assertUsernameAvailable(kind models.UserKind, id uint, username string) error {
	switch kind {
	case models.UserKindAdmin:
		var other models.AdminUser
		if err := db.DB.Where("username = ? AND id <> ?", username, id).First(&other).Error; err == nil {
			return errors.New("用户名已被占用")
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
	case models.UserKindRegular:
		var other models.RegularUser
		if err := db.DB.Where("username = ? AND id <> ?", username, id).First(&other).Error; err == nil {
			return errors.New("用户名已被占用")
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
	default:
		return errors.New("unknown user kind")
	}
	return nil
}

func updateUsername(kind models.UserKind, id uint, username string) error {
	switch kind {
	case models.UserKindAdmin:
		return db.DB.Model(&models.AdminUser{}).Where("id = ?", id).Update("username", username).Error
	case models.UserKindRegular:
		return db.DB.Model(&models.RegularUser{}).Where("id = ?", id).Update("username", username).Error
	}
	return errors.New("unknown user kind")
}

func updatePasswordHash(kind models.UserKind, id uint, hash string, mustChange bool) error {
	switch kind {
	case models.UserKindAdmin:
		return db.DB.Model(&models.AdminUser{}).Where("id = ?", id).Updates(map[string]any{
			"password_hash":        hash,
			"must_change_password": mustChange,
		}).Error
	case models.UserKindRegular:
		return db.DB.Model(&models.RegularUser{}).Where("id = ?", id).Updates(map[string]any{
			"password_hash":        hash,
			"must_change_password": mustChange,
		}).Error
	}
	return errors.New("unknown user kind")
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
