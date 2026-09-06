package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"mc/db"
	"mc/models"

	"github.com/gin-gonic/gin"
)

const (
	apiTokenPrefixLiteral = "mc_live_"
	apiTokenRandomBytes   = 32
	apiTokenPrefixDisplay = 12
)

type createAPITokenInput struct {
	Name      string `json:"name"`
	ExpiresIn int    `json:"expires_in_days"`
}

func listAPITokens(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	var rows []models.APIToken
	if err := db.DB.Where("user_id = ?", user.ID).Order("id desc").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for _, t := range rows {
		out = append(out, apiTokenPayloadFrom(&t))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func createAPIToken(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	var in createAPITokenInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = "未命名令牌"
	}
	if len(name) > 64 {
		name = name[:64]
	}
	if in.ExpiresIn < 0 {
		in.ExpiresIn = 0
	}
	if in.ExpiresIn > 3650 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "expires_in_days 不能超过 3650"})
		return
	}

	raw, err := generateAPIToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	sum := sha256.Sum256([]byte(raw))
	hash := hex.EncodeToString(sum[:])
	prefix := raw
	if len(prefix) > apiTokenPrefixDisplay {
		prefix = prefix[:apiTokenPrefixDisplay]
	}

	tok := models.APIToken{
		UserID:    user.ID,
		Name:      name,
		Prefix:    prefix,
		TokenHash: hash,
		Plain:     raw,
	}
	if in.ExpiresIn > 0 {
		exp := time.Now().Add(time.Duration(in.ExpiresIn) * 24 * time.Hour)
		tok.ExpiresAt = &exp
	}
	if err := db.DB.Create(&tok).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"token": apiTokenPayloadFrom(&tok),
			"plain": raw,
		},
	})
}

func revealAPIToken(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	id := c.Param("id")
	var tok models.APIToken
	if err := db.DB.Where("id = ? AND user_id = ?", id, user.ID).First(&tok).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "令牌不存在"})
		return
	}
	if tok.Plain == "" {
		c.JSON(http.StatusGone, gin.H{"error": "明文不可用（创建时间早于复制功能上线）"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"plain": tok.Plain,
			"revoked": tok.RevokedAt != nil,
			"expired": tok.ExpiresAt != nil && tok.ExpiresAt.Before(time.Now()),
		},
	})
}

func revokeAPIToken(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	id := c.Param("id")
	var tok models.APIToken
	if err := db.DB.Where("id = ? AND user_id = ?", id, user.ID).First(&tok).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "令牌不存在"})
		return
	}
	if tok.RevokedAt != nil {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "already_revoked": true}})
		return
	}
	now := time.Now()
	tok.RevokedAt = &now
	if err := db.DB.Save(&tok).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true}})
}

func apiTokenPayloadFrom(t *models.APIToken) gin.H {
	return gin.H{
		"id":          t.ID,
		"user_id":     t.UserID,
		"name":        t.Name,
		"prefix":      t.Prefix,
		"expires_at":  t.ExpiresAt,
		"last_used_at": t.LastUsedAt,
		"revoked_at":  t.RevokedAt,
		"created_at":  t.CreatedAt,
	}
}

func generateAPIToken() (string, error) {
	b := make([]byte, apiTokenRandomBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return apiTokenPrefixLiteral + hex.EncodeToString(b), nil
}
