package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"mc/datadb"
	"mc/logicmodels"
	"mc/pages"
	"mc/settings"

	"github.com/gin-gonic/gin"
)

const settingsDepsKey = "settingsDeps"

type SettingsDeps struct {
	Store        *settings.Store
	EditableKeys map[string]struct{}
	Manager      *datadb.Manager
	LMStore      *logicmodels.Store
	PagesStore   *pages.Store
}

type settingsPayload struct {
	Key       string `json:"key"`
	Value     string `json:"value"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

func listSettings(c *gin.Context) {
	deps := settingsDepsFrom(c)
	snap := deps.Store.Snapshot()
	rows := make([]settingsPayload, 0, len(snap))
	for k, v := range snap {
		rows = append(rows, settingsPayload{Key: k, Value: v})
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func updateSettings(c *gin.Context) {
	deps := settingsDepsFrom(c)
	var in struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	in.Key = strings.TrimSpace(in.Key)
	if in.Key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key 不能为空"})
		return
	}
	if _, ok := deps.EditableKeys[in.Key]; !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该设置项不可修改"})
		return
	}
	value := strings.TrimSpace(in.Value)
	switch in.Key {
	case settings.KeyUploadRoot:
		if value == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "上传根目录不能为空"})
			return
		}
		if !filepath.IsAbs(value) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "路径必须是绝对路径,如 /var/data/uploads"})
			return
		}
		if err := os.MkdirAll(value, 0o755); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无法创建目录: " + err.Error()})
			return
		}
		if err := os.WriteFile(filepath.Join(value, ".mc-upload-write-test"), []byte("ok"), 0o644); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "目录不可写: " + err.Error()})
			return
		} else {
			_ = os.Remove(filepath.Join(value, ".mc-upload-write-test"))
		}
	case settings.KeyManagedDBPath:
		if deps.Manager == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "数据库管理器未初始化"})
			return
		}
		if value == "" {
			if err := deps.Manager.Unload(); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "卸载失败: " + err.Error()})
				return
			}
			if deps.LMStore != nil {
				deps.LMStore.ResetCache()
			}
			if deps.PagesStore != nil {
				deps.PagesStore.ResetCache()
			}
			value = ""
		} else {
			if !filepath.IsAbs(value) {
				c.JSON(http.StatusBadRequest, gin.H{
					"error":  "数据库路径必须是绝对路径,如 /var/data/managed.db",
					"reason": "相对路径会因 CWD 不同而解析到不同位置,造成重启数据丢失",
				})
				return
			}
			abs, err := filepath.Abs(value)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "路径不合法: " + err.Error()})
				return
			}
			if dir := filepath.Dir(abs); dir != "" {
				if err := os.MkdirAll(dir, 0o755); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "无法创建父目录: " + err.Error()})
					return
				}
			}
			// Verify the path is actually writable so we don't store a
			// configuration that will only fail later with a cryptic
			// "readonly database" error.
			if err := os.WriteFile(abs+".mc-write-test", []byte("ok"), 0o644); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"error":  "目录不可写: " + err.Error(),
					"reason": "managed.db 所在目录或文件被设为只读,SQLite 无法写入",
				})
				return
			}
			_ = os.Remove(abs + ".mc-write-test")
			if err := deps.Manager.Load(abs); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "加载数据库失败: " + err.Error()})
				return
			}
			if deps.LMStore != nil {
				deps.LMStore.ResetCache()
			}
			if deps.PagesStore != nil {
				deps.PagesStore.ResetCache()
			}
			value = abs
		}
	}
	if err := deps.Store.Set(in.Key, value); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": settingsPayload{Key: in.Key, Value: value}})
}

func WithSettingsDeps(parent gin.HandlerFunc, deps *SettingsDeps) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(settingsDepsKey, deps)
		parent(c)
	}
}

func settingsDepsFrom(c *gin.Context) *SettingsDeps {
	if v, ok := c.Get(settingsDepsKey); ok {
		if d, ok := v.(*SettingsDeps); ok {
			return d
		}
	}
	return nil
}
