package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"mc/db"
	"mc/models"
	"mc/settings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	maxUploadSize  = 100 << 20
	uploadsPrefix  = "/uploads/"
	uploadFormKey  = "file"
	randomNameSize = 8
)

type UploadDeps struct {
	Store *settings.Store
}

func upload(c *gin.Context) {
	deps := uploadDepsFrom(c)
	if deps == nil || deps.Store == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "上传服务未初始化"})
		return
	}
	user := currentUser(c)

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadSize)
	if err := c.Request.ParseMultipartForm(maxUploadSize); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件过大或解析失败（上限 100MB）"})
		return
	}

	file, header, err := c.Request.FormFile(uploadFormKey)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未找到上传文件，请使用字段名 file"})
		return
	}
	defer file.Close()

	original := strings.TrimSpace(header.Filename)
	if original == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件名不能为空"})
		return
	}
	original = filepath.Base(original)
	safeName := sanitizeFilename(original)
	if safeName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件名不合法"})
		return
	}

	ext := strings.ToLower(filepath.Ext(original))
	stored := randomHex(randomNameSize) + ext

	root := deps.Store.GetString(settings.KeyUploadRoot)
	if root == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "上传根目录未配置"})
		return
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("无法解析上传根目录: %v", err)})
		return
	}
	if err := os.MkdirAll(absRoot, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("无法创建上传目录: %v", err)})
		return
	}

	now := time.Now()
	sub := filepath.Join(fmt.Sprintf("%04d", now.Year()), fmt.Sprintf("%02d", int(now.Month())))
	targetDir := filepath.Join(absRoot, sub)
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("无法创建子目录: %v", err)})
		return
	}
	targetPath := filepath.Join(targetDir, stored)

	dst, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("保存文件失败: %v", err)})
		return
	}
	written, err := io.Copy(dst, file)
	if cerr := dst.Close(); cerr != nil && err == nil {
		err = cerr
	}
	if err != nil {
		_ = os.Remove(targetPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("写入文件失败: %v", err)})
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = mime.TypeByExtension(ext)
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	rel := filepath.ToSlash(filepath.Join(sub, stored))
	att := models.Attachment{
		UserID:       user.ID,
		OriginalName: safeName,
		StoredName:   rel,
		Size:         written,
		ContentType:  contentType,
	}
	if err := db.DB.Create(&att).Error; err != nil {
		_ = os.Remove(targetPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("保存记录失败: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": attachmentPayload(att)})
}

func listUploads(c *gin.Context) {
	user := currentUser(c)
	var rows []models.Attachment
	if err := db.DB.Where("user_id = ?", user.ID).Order("id desc").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for _, a := range rows {
		out = append(out, attachmentPayload(a))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func deleteUpload(c *gin.Context) {
	deps := uploadDepsFrom(c)
	user := currentUser(c)
	id := c.Param("id")
	var att models.Attachment
	if err := db.DB.Where("id = ? AND user_id = ?", id, user.ID).First(&att).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "附件不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	root := deps.Store.GetString(settings.KeyUploadRoot)
	absRoot, _ := filepath.Abs(root)
	rel := filepath.FromSlash(att.StoredName)
	full := filepath.Join(absRoot, rel)
	if filepath.HasPrefix(full, absRoot+string(os.PathSeparator)) || full == absRoot {
		if err := os.Remove(full); err != nil && !errors.Is(err, os.ErrNotExist) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("删除文件失败: %v", err)})
			return
		}
	}
	if err := db.DB.Delete(&att).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true}})
}

func serveUpload(c *gin.Context) {
	deps := uploadDepsFrom(c)
	id := c.Param("id")
	var att models.Attachment
	if err := db.DB.First(&att, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "附件不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	root := deps.Store.GetString(settings.KeyUploadRoot)
	absRoot, _ := filepath.Abs(root)
	rel := filepath.FromSlash(att.StoredName)
	full := filepath.Clean(filepath.Join(absRoot, rel))
	if absRoot != "" && !strings.HasPrefix(full, absRoot+string(os.PathSeparator)) && full != absRoot {
		c.JSON(http.StatusForbidden, gin.H{"error": "非法的附件路径"})
		return
	}
	if _, err := os.Stat(full); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在"})
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", att.OriginalName))
	c.File(full)
}

func attachmentPayload(a models.Attachment) gin.H {
	return gin.H{
		"id":            a.ID,
		"user_id":       a.UserID,
		"original_name": a.OriginalName,
		"size":          a.Size,
		"content_type":  a.ContentType,
		"url":           fmt.Sprintf("%s%d", uploadsPrefix, a.ID),
		"created_at":    a.CreatedAt,
	}
}

func sanitizeFilename(name string) string {
	name = strings.ReplaceAll(name, "\\", "/")
	name = filepath.Base(name)
	name = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z',
			r >= 'A' && r <= 'Z',
			r >= '0' && r <= '9',
			r == '.', r == '-', r == '_',
			r == ' ', r == '(', r == ')',
			r == '[', r == ']', r == '@',
			r == '+', r == ',', r == '&':
			return r
		}
		return -1
	}, name)
	name = strings.TrimSpace(name)
	name = strings.TrimLeft(name, ".")
	if name == "" {
		return ""
	}
	if len(name) > 200 {
		name = name[:200]
	}
	return name
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

const uploadDepsKey = "uploadDeps"

func WithUploadDeps(parent gin.HandlerFunc, deps *UploadDeps) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(uploadDepsKey, deps)
		parent(c)
	}
}

func uploadDepsFrom(c *gin.Context) *UploadDeps {
	if v, ok := c.Get(uploadDepsKey); ok {
		if d, ok := v.(*UploadDeps); ok {
			return d
		}
	}
	return nil
}
