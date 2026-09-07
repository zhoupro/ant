package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"mc/db"
	"mc/applogs"
	"mc/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

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
func listLogs(c *gin.Context) {
	var q listLogsQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if q.Limit <= 0 || q.Limit > 200 {
		q.Limit = 50
	}
	if q.Offset < 0 {
		q.Offset = 0
	}
	if q.Order == "" {
		q.Order = "desc"
	}

	tx := db.DB.Model(&models.Log{})
	if q.Level != "" {
		tx = tx.Where("level = ?", q.Level)
	}
	if q.Source != "" {
		tx = tx.Where("source = ?", q.Source)
	}
	if s := strings.TrimSpace(q.Search); s != "" {
		like := "%" + s + "%"
		tx = tx.Where("title LIKE ? OR message LIKE ?", like, like)
	}

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var rows []models.Log
	order := "created_at desc"
	if strings.EqualFold(q.Order, "asc") {
		order = "created_at asc"
	}
	if err := tx.Order(order).Limit(q.Limit).Offset(q.Offset).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	items := make([]gin.H, 0, len(rows))
	for i := range rows {
		items = append(items, buildLogPayload(&rows[i]))
	}

	levels, sources := collectLogFacets()
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
func getLog(c *gin.Context) {
	id := c.Param("id")
	var row models.Log
	if err := db.DB.First(&row, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "日志不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": buildLogPayload(&row)})
}

// createLog POST /api/logs —— 供前端手动写入;也作为公开 API 暴露。
func createLog(c *gin.Context) {
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

	entry := models.Log{
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

	err := db.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&entry).Error; err != nil {
			return err
		}
		if len(in.ImageIDs) > 0 {
			unique := dedupLogImageIDs(in.ImageIDs)
			if err := assertAttachmentsExist(tx, unique); err != nil {
				return err
			}
			rows := make([]models.LogImage, 0, len(unique))
			for i, id := range unique {
				rows = append(rows, models.LogImage{
					LogID:        entry.ID,
					AttachmentID: id,
					SortOrder:    i,
				})
			}
			if err := tx.Create(&rows).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var saved models.Log
	db.DB.First(&saved, entry.ID)
	c.JSON(http.StatusOK, gin.H{"data": buildLogPayload(&saved)})
}

// deleteLog DELETE /api/logs/:id
func deleteLog(c *gin.Context) {
	id := c.Param("id")
	err := db.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("log_id = ?", id).Delete(&models.LogImage{}).Error; err != nil {
			return err
		}
		return tx.Delete(&models.Log{}, id).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "id": id}})
}

// clearLogs DELETE /api/logs —— 清空全部日志(以及关联表)。需要 manage_logs 权限。
func clearLogs(c *gin.Context) {
	err := db.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("1 = 1").Delete(&models.LogImage{}).Error; err != nil {
			return err
		}
		return tx.Where("1 = 1").Delete(&models.Log{}).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true}})
}

// logFacets GET /api/logs/facets —— 返回去重后的 level / source 列表,便于前端填充过滤下拉框。
func logFacets(c *gin.Context) {
	levels, sources := collectLogFacets()
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"levels":  levels,
		"sources": sources,
	}})
}

func collectLogFacets() ([]string, []string) {
	levels := []string{
		string(models.LogLevelDebug),
		string(models.LogLevelInfo),
		string(models.LogLevelWarn),
		string(models.LogLevelError),
	}
	var rawSources []string
	db.DB.Model(&models.Log{}).
		Distinct("source").
		Where("source <> ''").
		Pluck("source", &rawSources)
	sources := make([]string, 0, len(rawSources))
	for _, s := range rawSources {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		sources = append(sources, s)
	}
	return levels, sources
}

// buildLogPayload 把一条日志行打包成前端友好的 JSON。
// 关联的 attachment 列表通过 LogImage 表 LEFT JOIN 取出。
func buildLogPayload(row *models.Log) gin.H {
	var images []models.LogImage
	db.DB.Where("log_id = ?", row.ID).Order("sort_order asc, attachment_id asc").Find(&images)

	attachments := make([]gin.H, 0, len(images))
	if len(images) > 0 {
		ids := make([]uint, 0, len(images))
		for _, li := range images {
			ids = append(ids, li.AttachmentID)
		}
		var atts []models.Attachment
		db.DB.Where("id IN ?", ids).Find(&atts)
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