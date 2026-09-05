package handlers

import (
	"errors"
	"fmt"
	"mc/datadb"
	"mc/logicmodels"
	"net/http"
	"regexp"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type LogicModelsHandler struct {
	store *logicmodels.Store
	mgr   *datadb.Manager
}

func NewLogicModelsHandler(store *logicmodels.Store, mgr *datadb.Manager) *LogicModelsHandler {
	return &LogicModelsHandler{store: store, mgr: mgr}
}

type modelSummary struct {
	Slug        string `json:"slug"`
	Label       string `json:"label"`
	Description string `json:"description"`
	UpdatedAt   string `json:"updated_at"`
}

func (h *LogicModelsHandler) list(c *gin.Context) {
	rows, err := h.store.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]modelSummary, 0, len(rows))
	for _, r := range rows {
		out = append(out, modelSummary{
			Slug:        r.Slug,
			Label:       r.Label,
			Description: r.Description,
			UpdatedAt:   r.UpdatedAt.Format("2006-01-02 15:04:05"),
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func (h *LogicModelsHandler) get(c *gin.Context) {
	slug := c.Param("slug")
	row, err := h.store.Get(slug)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "逻辑模型不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

type saveModelInput struct {
	Slug        string                   `json:"slug"`
	Label       string                   `json:"label"`
	Description string                   `json:"description"`
	Config      logicmodels.ModelConfig  `json:"config"`
}

func (h *LogicModelsHandler) save(c *gin.Context) {
	var in saveModelInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row, err := h.store.Upsert(strings.TrimSpace(in.Slug), strings.TrimSpace(in.Label), in.Description, in.Config)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func (h *LogicModelsHandler) delete(c *gin.Context) {
	slug := c.Param("slug")
	if err := h.store.Delete(slug); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "slug": slug}})
}

type physicalTableInfo struct {
	Name        string                  `json:"name"`
	Columns     []columnInfo            `json:"columns"`
	PrimaryKeys []string                `json:"primary_keys"`
	ForeignKeys []datadb.ForeignKey     `json:"foreign_keys"`
}

type columnInfo struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	NotNull    bool   `json:"notnull"`
	PrimaryKey bool   `json:"pk"`
	Default    string `json:"default"`
}

func (h *LogicModelsHandler) tables(c *gin.Context) {
	gdb, ok := h.db(c)
	if !ok {
		return
	}
	type row struct{ Name string }
	var rows []row
	if err := gdb.Raw(
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
	).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	tables := make([]physicalTableInfo, 0, len(rows))
	for _, r := range rows {
		if r.Name == "" {
			continue
		}
		schema, err := readPhysicalSchema(gdb, r.Name)
		if err != nil {
			continue
		}
		pi := physicalTableInfo{
			Name:        schema.Name,
			PrimaryKeys: schema.PrimaryKeys,
			ForeignKeys: schema.ForeignKeys,
		}
		for _, col := range schema.Columns {
			pi.Columns = append(pi.Columns, columnInfo{
				Name:       col.Name,
				Type:       col.Type,
				NotNull:    col.NotNull,
				PrimaryKey: col.PrimaryKey,
				Default:    col.Default,
			})
		}
		tables = append(tables, pi)
	}
	sort.SliceStable(tables, func(i, j int) bool { return tables[i].Name < tables[j].Name })
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"tables": tables}})
}

func (h *LogicModelsHandler) tableSchema(c *gin.Context) {
	gdb, ok := h.db(c)
	if !ok {
		return
	}
	table := c.Param("name")
	if err := validateIdent(table); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	schema, err := readPhysicalSchema(gdb, table)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pi := physicalTableInfo{
		Name:        schema.Name,
		PrimaryKeys: schema.PrimaryKeys,
		ForeignKeys: schema.ForeignKeys,
	}
	for _, col := range schema.Columns {
		pi.Columns = append(pi.Columns, columnInfo{
			Name:       col.Name,
			Type:       col.Type,
			NotNull:    col.NotNull,
			PrimaryKey: col.PrimaryKey,
			Default:    col.Default,
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": pi})
}

func (h *LogicModelsHandler) businessTypes(c *gin.Context) {
	types := logicmodels.BusinessTypes()
	out := make([]gin.H, 0, len(types))
	for _, t := range types {
		out = append(out, gin.H{
			"value": t,
			"label": logicmodels.BusinessTypeLabel(t),
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func (h *LogicModelsHandler) db(c *gin.Context) (*gorm.DB, bool) {
	gdb, err := h.mgr.Current()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return nil, false
	}
	return gdb, true
}

var _ = fmt.Sprintf
var _ = regexp.QuoteMeta