package handlers

import (
	"mc/datadb"
	"net/http"

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