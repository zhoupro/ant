package handlers

import (
	"mc/datadb"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

type DBFileHandler struct {
	mgr *datadb.Manager
}

func NewDBFileHandler(mgr *datadb.Manager) *DBFileHandler {
	return &DBFileHandler{mgr: mgr}
}

func (h *DBFileHandler) status(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": h.mgr.Status()})
}

func (h *DBFileHandler) upload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择要上传的 .db 文件"})
		return
	}
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".db" && ext != ".sqlite" && ext != ".sqlite3" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 .db / .sqlite / .sqlite3 文件"})
		return
	}
	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer src.Close()

	buf := make([]byte, file.Size)
	if _, err := src.Read(buf); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	dest, err := h.mgr.LoadFromUpload(file.Filename, buf)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": h.mgr.Status()})
	_ = dest
}

type loadPathInput struct {
	Path string `json:"path"`
}

func (h *DBFileHandler) load(c *gin.Context) {
	var in loadPathInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(in.Path) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供文件路径"})
		return
	}
	if err := h.mgr.Load(in.Path); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": h.mgr.Status()})
}

func (h *DBFileHandler) unload(c *gin.Context) {
	if err := h.mgr.Unload(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"loaded": false}})
}