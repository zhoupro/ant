package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// cronNextRunsHandler 解析 query 中的 cron 表达式,返回接下来 N 次的运行时间。
// 给逻辑模型里的「定时」业务类型使用 —— 用户在前端选择友好的调度方式后,
// 这里把存储用的标准 5 段表达式翻译成时间戳列表,展示给用户预览。
//
// Query:
//
//	expr   标准 5 段 cron 表达式(必填)
//	count  返回条数,默认 5,上限 20
//	from   基准时间,RFC3339,默认当前时间
func cronNextRunsHandler(c *gin.Context) {
	expr := strings.TrimSpace(c.Query("expr"))
	if expr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 expr 参数"})
		return
	}
	if len(expr) > 128 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cron 表达式过长"})
		return
	}
	count := 5
	if raw := strings.TrimSpace(c.Query("count")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "count 需要为正整数"})
			return
		}
		if n > 20 {
			n = 20
		}
		count = n
	}
	from := time.Now()
	if raw := strings.TrimSpace(c.Query("from")); raw != "" {
		t, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "from 需要为 RFC3339 时间"})
			return
		}
		from = t
	}

	schedule, err := cronExprParser.Parse(expr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("cron 表达式无效: %v", err)})
		return
	}

	runs := make([]string, 0, count)
	next := schedule.Next(from)
	for i := 0; i < count; i++ {
		if next.IsZero() {
			break
		}
		runs = append(runs, next.UTC().Format(time.RFC3339))
		next = schedule.Next(next)
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"expr":  expr,
		"from":  from.UTC().Format(time.RFC3339),
		"count": len(runs),
		"runs":  runs,
	}})
}
