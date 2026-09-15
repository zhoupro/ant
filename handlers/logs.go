package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"mc/applogs"
	"mc/db"
	"mc/logentries"
	"mc/models"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// LogsHandler 把所有 /api/logs* 端点集中在一处,持有一个 *logentries.Store
// 实例(由 Register 时注入)。
type LogsHandler struct {
	store *logentries.Store
}

func NewLogsHandler(store *logentries.Store) *LogsHandler {
	return &LogsHandler{store: store}
}

type logInput struct {
	Level    models.LogLevel `json:"level"`
	Source   string          `json:"source"`
	Title    string          `json:"title"`
	Message  string          `json:"message"`
	Metadata any             `json:"metadata"`
	ImageIDs []uint          `json:"image_ids"`
}

type listLogsQuery struct {
	Level  string `form:"level"`
	Source string `form:"source"`
	Search string `form:"search"`
	Limit  int    `form:"limit"`
	Offset int    `form:"offset"`
	Order  string `form:"order"`
}

// listLogs GET /api/logs?level=&source=&search=&limit=&offset=&order=
func (h *LogsHandler) listLogs(c *gin.Context) {
	var q listLogsQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rows, total, levels, sources, err := h.store.List(logentries.ListQuery{
		Level:  q.Level,
		Source: q.Source,
		Search: q.Search,
		Limit:  q.Limit,
		Offset: q.Offset,
		Order:  q.Order,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	items := make([]gin.H, 0, len(rows))
	for i := range rows {
		items = append(items, h.buildLogPayload(&rows[i]))
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"items":   items,
		"total":   total,
		"limit":   q.Limit,
		"offset":  q.Offset,
		"levels":  levels,
		"sources": sources,
	}})
}

// getLog GET /api/logs/:id
func (h *LogsHandler) getLog(c *gin.Context) {
	id := c.Param("id")
	row, err := h.store.Get(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "日志不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": h.buildLogPayload(row)})
}

// createLog POST /api/logs —— 公开写入入口,供外部系统通过 Bearer / Cookie
// 调用,日志随后落到受管库并通过「日志」页面以逻辑模型方式呈现。
func (h *LogsHandler) createLog(c *gin.Context) {
	var in logInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	level := in.Level
	if level == "" {
		level = models.LogLevelInfo
	}
	switch level {
	case models.LogLevelDebug, models.LogLevelInfo, models.LogLevelWarn, models.LogLevelError:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "level 必须是 debug/info/warn/error 之一"})
		return
	}
	source := strings.TrimSpace(in.Source)
	if source == "" {
		source = "manual"
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title 不能为空"})
		return
	}
	if len(title) > 255 {
		title = title[:255]
	}

	entry := logentries.Log{
		Level:   level,
		Source:  source,
		Title:   title,
		Message: in.Message,
	}
	if p := currentPrincipal(c); p != nil {
		uid := p.user.ID
		entry.UserID = &uid
		k := p.user.UserKind
		entry.UserKind = &k
		entry.Username = p.user.Username
	}
	if in.Metadata != nil {
		b, err := json.Marshal(in.Metadata)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("metadata 序列化失败: %v", err)})
			return
		}
		entry.Metadata = string(b)
	}

	if len(in.ImageIDs) > 0 {
		unique := dedupLogImageIDs(in.ImageIDs)
		if err := assertAttachmentsExist(db.DB, unique); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	if err := h.store.Create(&entry, in.ImageIDs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Create 直接基于已落库的 entry 序列化(连同日志 images)返回,
	// 不再二次 SELECT —— 同连接的事务刚 commit 后,马上 SELECT 会被
	// GORM 的连接池拿到另一条空闲连接,极少数情况下会错过提交。
	c.JSON(http.StatusOK, gin.H{"data": h.buildLogPayload(&entry)})
}

// deleteLog DELETE /api/logs/:id
func (h *LogsHandler) deleteLog(c *gin.Context) {
	id := c.Param("id")
	if err := h.store.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "id": id}})
}

// clearLogs DELETE /api/logs —— 清空全部日志(以及关联表)。需要 manage_logs 权限。
func (h *LogsHandler) clearLogs(c *gin.Context) {
	if err := h.store.Clear(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true}})
}

// logFacets GET /api/logs/facets —— 返回去重后的 level / source 列表。
func (h *LogsHandler) logFacets(c *gin.Context) {
	levels, sources := h.store.Facets()
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"levels":  levels,
		"sources": sources,
	}})
}

// buildLogPayload 把一条日志行打包成前端友好的 JSON。关联附件通过 log_images
// 表读取(数据在受管库);附件元数据需要再回到 app.db 取出。
func (h *LogsHandler) buildLogPayload(row *logentries.Log) gin.H {
	var images []logentries.LogImage
	if gdb, err := h.store.DB(); err == nil {
		gdb.Where("log_id = ?", row.ID).
			Order("sort_order asc, attachment_id asc").
			Find(&images)
	}

	attachments := make([]gin.H, 0, len(images))
	if len(images) > 0 {
		ids := make([]uint, 0, len(images))
		for _, li := range images {
			ids = append(ids, li.AttachmentID)
		}
		var atts []models.Attachment
		if err := db.DB.Where("id IN ?", ids).Find(&atts).Error; err == nil {
			byID := make(map[uint]models.Attachment, len(atts))
			for _, a := range atts {
				byID[a.ID] = a
			}
			for _, li := range images {
				a, ok := byID[li.AttachmentID]
				if !ok {
					continue
				}
				attachments = append(attachments, gin.H{
					"id":            a.ID,
					"original_name": a.OriginalName,
					"size":          a.Size,
					"content_type":  a.ContentType,
					"url":           fmt.Sprintf("/uploads/%d", a.ID),
					"created_at":    a.CreatedAt,
				})
			}
		}
	}

	var metadata any
	if row.Metadata != "" {
		var raw any
		if err := json.Unmarshal([]byte(row.Metadata), &raw); err == nil {
			metadata = raw
		} else {
			metadata = row.Metadata
		}
	}

	return gin.H{
		"id":          row.ID,
		"level":       row.Level,
		"source":      row.Source,
		"title":       row.Title,
		"message":     row.Message,
		"user_id":     row.UserID,
		"user_kind":   row.UserKind,
		"username":    row.Username,
		"method":      row.Method,
		"path":        row.Path,
		"status_code": row.StatusCode,
		"ip":          row.IP,
		"user_agent":  row.UserAgent,
		"duration_ms": row.DurationMs,
		"metadata":    metadata,
		"images":      attachments,
		"created_at":  row.CreatedAt,
	}
}

// assertAttachmentsExist 校验图片 ID 列表都能在 app.db 的 attachments 中找到。
func assertAttachmentsExist(tx *gorm.DB, ids []uint) error {
	if len(ids) == 0 {
		return nil
	}
	var count int64
	if err := tx.Model(&models.Attachment{}).Where("id IN ?", ids).Count(&count).Error; err != nil {
		return err
	}
	if int(count) != len(ids) {
		return fmt.Errorf("有 %d 张图片不存在", len(ids)-int(count))
	}
	return nil
}

func dedupLogImageIDs(in []uint) []uint {
	seen := make(map[uint]struct{}, len(in))
	out := make([]uint, 0, len(in))
	for _, v := range in {
		if v == 0 {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// HTTPRequestLogMiddleware 【默认未启用】 —— 仅在确实需要审计本服务自身请求时才挂上。
// 该中间件会把本服务的所有 HTTP 请求当成"日志"写进 logs 表,这与「日志服务只接受外部
// 主动写入」的设计冲突,因此默认不在 main.go 装载。如需启用,在路由前 Use 这个 handler
// 即可(例如在反向代理前埋点时)。
//
// 启用后会记录:
//   - 所有 4xx / 5xx 响应(包含登录失败);
//   - 已登录用户的非幂等写操作(POST/PATCH/DELETE/PUT)成功执行;
//   - /healthz 健康检查即使成功也会被记录,便于排查偶发问题。
//
// 其它"安静的成功 GET" 不进日志,避免日志表暴涨。
func HTTPRequestLogMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		status := c.Writer.Status()

		interesting := status >= 400
		if !interesting {
			switch c.Request.Method {
			case http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodPatch:
				if _, ok := c.Get(principalKey); ok {
					interesting = true
				}
			}
		}
		if !interesting {
			return
		}

		level := models.LogLevelInfo
		switch {
		case status >= 500:
			level = models.LogLevelError
		case status >= 400:
			level = models.LogLevelWarn
		}
		duration := int(time.Since(start).Milliseconds())

		entry := applogs.Entry{
			Level:      level,
			Source:     "http",
			Title:      fmt.Sprintf("%s %s → %d", c.Request.Method, c.Request.URL.Path, status),
			Method:     c.Request.Method,
			Path:       c.Request.URL.Path,
			StatusCode: &status,
			IP:         c.ClientIP(),
			UserAgent:  truncate(c.Request.UserAgent(), 255),
			DurationMs: &duration,
		}
		if v, ok := c.Get(principalKey); ok {
			if p, ok := v.(*principal); ok && p != nil && p.user != nil {
				uid := p.user.ID
				entry.UserID = &uid
				k := p.user.UserKind
				entry.UserKind = &k
				entry.Username = p.user.Username
			}
		}
		applogs.Record(entry)
	}
}