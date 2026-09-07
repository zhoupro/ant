// Package applogs 实现应用内统一的日志落库能力。
//
// 调用方通过 Record/RecordFromGin 等函数写入条目,日志会异步写入 `logs` 表;
// 同时支持把已有的附件(图片)关联到日志条目,方便在前端还原现场截图。
package applogs
import (
	"encoding/json"
	"log"
	"strconv"
	"sync"

	"mc/db"
	"mc/models"

	"github.com/gin-gonic/gin"
)

// Entry 单条日志的输入数据。所有字段可选,Level 默认 info,Source 默认 manual。
type Entry struct {
	Level      models.LogLevel
	Source     string
	Title      string
	Message    string
	UserID     *uint
	UserKind   *models.UserKind
	Username   string
	Method     string
	Path       string
	StatusCode *int
	IP         string
	UserAgent  string
	DurationMs *int
	Metadata   any
	ImageIDs   []uint
}

var (
	queueMu sync.Mutex
	queue   = make(chan Entry, 512)
	started bool
)

// Start 启动后台落库 worker。多次调用幂等。
func Start() {
	queueMu.Lock()
	defer queueMu.Unlock()
	if started {
		return
	}
	started = true
	go runWorker()
}

func init() { Start() }

func runWorker() {
	for e := range queue {
		if err := persist(e); err != nil {
			log.Printf("logs: persist failed: %v", err)
		}
	}
}

// Record 把一条日志放入异步队列。若队列已满则退化为同步写入,避免丢日志。
func Record(e Entry) {
	if e.Level == "" {
		e.Level = models.LogLevelInfo
	}
	if e.Source == "" {
		e.Source = "manual"
	}
	if e.Title == "" {
		e.Title = "(未命名)"
	}
	select {
	case queue <- e:
	default:
		if err := persist(e); err != nil {
			log.Printf("logs: synchronous persist failed: %v", err)
		}
	}
}

// RecordFromGin 从 gin.Context 自动提取 method/path/IP/user agent/status,
// 拼装后写入日志。调用方需要自行填好 Source/Title/Message/Level/UserID 等业务字段;
// 重复字段(用户已填)不会被覆盖。
func RecordFromGin(c *gin.Context, e Entry) {
	if c != nil {
		if e.Method == "" {
			e.Method = c.Request.Method
		}
		if e.Path == "" {
			e.Path = c.Request.URL.Path
		}
		if e.IP == "" {
			e.IP = c.ClientIP()
		}
		if e.UserAgent == "" {
			e.UserAgent = c.Request.UserAgent()
		}
		if e.StatusCode == nil && c.Writer != nil {
			sc := c.Writer.Status()
			if sc > 0 {
				e.StatusCode = &sc
			}
		}
	}
	Record(e)
}

func persist(e Entry) error {
	var metaJSON string
	if e.Metadata != nil {
		b, err := json.Marshal(e.Metadata)
		if err != nil {
			return err
		}
		metaJSON = string(b)
	}
	entry := models.Log{
		Level:      e.Level,
		Source:     e.Source,
		Title:      e.Title,
		Message:    e.Message,
		UserID:     e.UserID,
		UserKind:   e.UserKind,
		Username:   e.Username,
		Method:     e.Method,
		Path:       e.Path,
		StatusCode: e.StatusCode,
		IP:         e.IP,
		UserAgent:  e.UserAgent,
		DurationMs: e.DurationMs,
		Metadata:   metaJSON,
	}
	if err := db.DB.Create(&entry).Error; err != nil {
		return err
	}
	if len(e.ImageIDs) > 0 {
		rows := make([]models.LogImage, 0, len(e.ImageIDs))
		for i, id := range e.ImageIDs {
			rows = append(rows, models.LogImage{
				LogID:        entry.ID,
				AttachmentID: id,
				SortOrder:    i,
			})
		}
		if err := db.DB.Create(&rows).Error; err != nil {
			return err
		}
	}
	return nil
}

// FormatIntPtr 把 *int 序列化成字符串,空指针返回空串。
func FormatIntPtr(v *int) string {
	if v == nil {
		return ""
	}
	return strconv.Itoa(*v)
}