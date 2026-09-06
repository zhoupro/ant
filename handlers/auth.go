package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
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
	var user models.User
	if err := db.DB.Where("username = ?", in.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(in.Password)); err != nil {
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
		UserID:    user.ID,
		ExpiresAt: time.Now().Add(sessionTTL),
	}
	if err := db.DB.Create(&sess).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(sessionCookie, token, int(sessionTTL.Seconds()), "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"data": user})
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
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": user})
}

func changePassword(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
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
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(in.OldPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "旧密码错误"})
		return
	}
	newUsername := strings.TrimSpace(in.NewUsername)
	if newUsername != "" && newUsername != user.Username {
		if len(newUsername) < 2 || len(newUsername) > 64 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "用户名长度需在 2~64 之间"})
			return
		}
		var existing models.User
		if err := db.DB.Where("username = ? AND id <> ?", newUsername, user.ID).First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "用户名已被占用"})
			return
		} else if err != gorm.ErrRecordNotFound {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		user.Username = newUsername
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	user.PasswordHash = string(hash)
	user.MustChangePassword = false
	if err := db.DB.Save(user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": user})
}

func authRequired(c *gin.Context) {
	if user := loadUserFromContext(c); user != nil {
		c.Set("currentUser", user)
		c.Next()
		return
	}
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
}

// loadUserFromContext resolves a *models.User from either the session cookie
// or an "Authorization: Bearer <token>" header (API token). It returns nil
// when neither credential is valid.
func loadUserFromContext(c *gin.Context) *models.User {
	if cookieToken, err := c.Cookie(sessionCookie); err == nil && cookieToken != "" {
		var sess models.Session
		if err := db.DB.Where("token = ?", cookieToken).First(&sess).Error; err == nil {
			if time.Now().After(sess.ExpiresAt) {
				db.DB.Delete(&sess)
				return nil
			}
			var user models.User
			if err := db.DB.First(&user, sess.UserID).Error; err == nil {
				return &user
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
			var user models.User
			if err := db.DB.First(&user, tok.UserID).Error; err != nil {
				return nil
			}
			now := time.Now()
			db.DB.Model(&tok).Update("last_used_at", &now)
			return &user
		}
	}
	return nil
}

func currentUser(c *gin.Context) *models.User {
	if v, ok := c.Get("currentUser"); ok {
		if u, ok := v.(*models.User); ok {
			return u
		}
	}
	return nil
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
