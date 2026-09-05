package handlers

import (
	"errors"
	"mc/datadb"
	"mc/pages"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type PagesHandler struct {
	store *pages.Store
}

func NewPagesHandler(store *pages.Store) *PagesHandler { return &PagesHandler{store: store} }

type pageInput struct {
	Slug      string `json:"slug"`
	Label     string `json:"label"`
	Icon      string `json:"icon"`
	ParentID  string `json:"parent_id"`
	ModelSlug string `json:"model_slug"`
	Sort      int    `json:"sort"`
}

func (h *PagesHandler) list(c *gin.Context) {
	rows, err := h.store.List()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *PagesHandler) get(c *gin.Context) {
	id := c.Param("id")
	row, err := h.store.Get(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "页面不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func (h *PagesHandler) create(c *gin.Context) {
	var in pageInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row, err := h.store.Create(pages.Page{
		Slug:      strings.TrimSpace(in.Slug),
		Label:     strings.TrimSpace(in.Label),
		Icon:      strings.TrimSpace(in.Icon),
		ParentID:  strings.TrimSpace(in.ParentID),
		ModelSlug: strings.TrimSpace(in.ModelSlug),
		Sort:      in.Sort,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func (h *PagesHandler) update(c *gin.Context) {
	id := c.Param("id")
	var in pageInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row, err := h.store.Update(id, pages.Page{
		Slug:      strings.TrimSpace(in.Slug),
		Label:     strings.TrimSpace(in.Label),
		Icon:      strings.TrimSpace(in.Icon),
		ParentID:  strings.TrimSpace(in.ParentID),
		ModelSlug: strings.TrimSpace(in.ModelSlug),
		Sort:      in.Sort,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func (h *PagesHandler) delete(c *gin.Context) {
	id := c.Param("id")
	if err := h.store.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true, "id": id}})
}

func (h *PagesHandler) icons(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": pages.AllowedIcons})
}

var _ datadb.Manager // keep the import in case future endpoints need it