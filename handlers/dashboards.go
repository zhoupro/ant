package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"mc/dashboards"
	"mc/datadb"
	"mc/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// DashboardsHandler 把 dashboards.Store 包装成 HTTP 接口。
// 拆出独立 handler 是为了与 cronjobs 保持一致 —— 复杂模块自带路由注册函数。
type DashboardsHandler struct {
	store *dashboards.Store
	mgr   *datadb.Manager
}

func NewDashboardsHandler(store *dashboards.Store, mgr *datadb.Manager) *DashboardsHandler {
	return &DashboardsHandler{store: store, mgr: mgr}
}

// ----- Dashboard 容器 --------------------------------------------------------

func (h *DashboardsHandler) listDashboards(c *gin.Context) {
	rows, err := h.store.ListDashboards()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

// dashboardIcons 把后端允许的图标清单暴露给前端,与 pages/icons 同样的契约。
func (h *DashboardsHandler) dashboardIcons(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": dashboards.AllowedIcons})
}

func (h *DashboardsHandler) getDashboard(c *gin.Context) {
	row, err := h.store.GetDashboard(c.Param("id"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "统计中心不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	cards, err := h.store.ListCards(row.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"dashboard": row,
		"cards":     cards,
	}})
}

func (h *DashboardsHandler) createDashboard(c *gin.Context) {
	var in dashboardInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row, err := h.store.CreateDashboard(dashboards.Dashboard{
		Slug:  strings.TrimSpace(in.Slug),
		Label: strings.TrimSpace(in.Label),
		Icon:  strings.TrimSpace(in.Icon),
		Sort:  in.Sort,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func (h *DashboardsHandler) updateDashboard(c *gin.Context) {
	id := c.Param("id")
	if _, err := h.store.GetDashboard(id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "统计中心不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var in dashboardInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row, err := h.store.UpdateDashboard(id, dashboards.Dashboard{
		Slug:  strings.TrimSpace(in.Slug),
		Label: strings.TrimSpace(in.Label),
		Icon:  strings.TrimSpace(in.Icon),
		Sort:  in.Sort,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func (h *DashboardsHandler) deleteDashboard(c *gin.Context) {
	if err := h.store.DeleteDashboard(c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "id": c.Param("id")}})
}

// ----- 卡片 CRUD --------------------------------------------------------------

func (h *DashboardsHandler) listCards(c *gin.Context) {
	id := c.Param("id")
	if _, err := h.store.GetDashboard(id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "统计中心不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	rows, err := h.store.ListCards(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *DashboardsHandler) createCard(c *gin.Context) {
	id := c.Param("id")
	if _, err := h.store.GetDashboard(id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "统计中心不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var in cardInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row, err := h.store.CreateCard(dashboards.Card{
		DashboardID: id,
		Title:       strings.TrimSpace(in.Title),
		Kind:        in.Kind,
		SQL:         in.SQL,
		Config:      in.Config,
		Sort:        in.Sort,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func (h *DashboardsHandler) updateCard(c *gin.Context) {
	cardID := c.Param("cardId")
	if _, err := h.store.GetCard(cardID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "卡片不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var in cardInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 路径里的 dashboard id 优先;前端不传 dashboard_id 时也允许只传卡片本体。
	dashboardID := c.Param("id")
	if strings.TrimSpace(in.DashboardID) != "" {
		dashboardID = strings.TrimSpace(in.DashboardID)
	}
	row, err := h.store.UpdateCard(cardID, dashboards.Card{
		DashboardID: dashboardID,
		Title:       strings.TrimSpace(in.Title),
		Kind:        in.Kind,
		SQL:         in.SQL,
		Config:      in.Config,
		Sort:        in.Sort,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func (h *DashboardsHandler) deleteCard(c *gin.Context) {
	if err := h.store.DeleteCard(c.Param("cardId")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "id": c.Param("cardId")}})
}

// ----- 运行卡片 SQL -----------------------------------------------------------

// runCard 校验 SQL 后,直接在受管库里执行(只读),
// 返回若干行结果与列名,前端再按 Kind 决定如何渲染。
// LIMIT 由服务端强制覆盖,不允许在 SQL 里绕过。
func (h *DashboardsHandler) runCard(c *gin.Context) {
	cardID := c.Param("cardId")
	card, err := h.store.GetCard(cardID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "卡片不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	sanitized, err := dashboards.SanitizeSQL(card.SQL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "SQL 不允许执行: " + err.Error()})
		return
	}
	gdb, err := h.mgr.Current()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// 强制加 LIMIT,防止脚本式 SELECT 全表。
	limit := 1000
	finalSQL := wrapSelectLimit(sanitized, limit)
	rows := make([]map[string]any, 0)
	if err := gdb.Raw(finalSQL).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "SQL 执行失败: " + err.Error()})
		return
	}
	columns := inferColumns(rows)
	cfg, _ := card.Decode()
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"card_id": card.ID,
		"kind":    card.Kind,
		"config":  cfg,
		"columns": columns,
		"rows":    rows,
		"limit":   limit,
	}})
}

// inferColumns 从已扫描的 map 里抽出列名,按出现顺序稳定返回;
// rows 为空时返回空数组而不是 nil,便于前端直接 .map()。
func inferColumns(rows []map[string]any) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, r := range rows {
		for k := range r {
			if !seen[k] {
				seen[k] = true
				out = append(out, k)
			}
		}
	}
	return out
}

// wrapSelectLimit 在最外层 SELECT 外再套一层 SELECT ... LIMIT ?,?;
// 这样无论用户写的是 SELECT 还是 WITH ... SELECT,都可以强制 LIMIT。
// 通过把原始 SQL 当作子查询包裹,GORM 不会尝试解析我们的参数。
func wrapSelectLimit(sql string, limit int) string {
	return fmt.Sprintf("SELECT * FROM (%s) AS mc_dash LIMIT %d", sql, limit)
}

// ----- 输入结构 --------------------------------------------------------------

type dashboardInput struct {
	Slug  string `json:"slug"`
	Label string `json:"label"`
	Icon  string `json:"icon"`
	Sort  int    `json:"sort"`
}

type cardInput struct {
	DashboardID string `json:"dashboard_id"`
	Title       string `json:"title"`
	Kind        string `json:"kind"`
	SQL         string `json:"sql"`
	Config      string `json:"config"`
	Sort        int    `json:"sort"`
}

// RegisterDashboardRoutes 把 /api/dashboards/* 全部注册到 router 上。
// 这里手动拆 view/manage 中间件,与 handlers.go 内的写法保持一致。
func RegisterDashboardRoutes(api *gin.RouterGroup, store *dashboards.Store, mgr *datadb.Manager) {
	h := NewDashboardsHandler(store, mgr)
	view := requirePermission(models.PermViewDashboards)
	manage := requirePermission(models.PermManageDashboards)

	api.GET("/dashboards", authRequired, view, h.listDashboards)
	api.POST("/dashboards", authRequired, manage, h.createDashboard)
	api.GET("/dashboards/icons", authRequired, view, h.dashboardIcons)
	api.GET("/dashboards/:id", authRequired, view, h.getDashboard)
	api.PUT("/dashboards/:id", authRequired, manage, h.updateDashboard)
	api.DELETE("/dashboards/:id", authRequired, manage, h.deleteDashboard)

	api.GET("/dashboards/:id/cards", authRequired, view, h.listCards)
	api.POST("/dashboards/:id/cards", authRequired, manage, h.createCard)
	api.PUT("/dashboards/:id/cards/:cardId", authRequired, manage, h.updateCard)
	api.DELETE("/dashboards/:id/cards/:cardId", authRequired, manage, h.deleteCard)

	api.POST("/dashboards/:id/cards/:cardId/run", authRequired, view, h.runCard)
}