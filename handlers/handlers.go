package handlers

import (
	"mc/db"
	"mc/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func Register(r *gin.Engine) {
	api := r.Group("/api")
	{
		api.GET("/notes", listNotes)
		api.GET("/notes/:id", getNote)
		api.POST("/notes", createNote)
		api.PUT("/notes/:id", updateNote)
		api.DELETE("/notes/:id", deleteNote)
	}
}

func listNotes(c *gin.Context) {
	var notes []models.Note
	if err := db.DB.Order("updated_at desc").Find(&notes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": notes})
}

func getNote(c *gin.Context) {
	var note models.Note
	if err := db.DB.First(&note, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": note})
}

func createNote(c *gin.Context) {
	var in models.Note
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	in.ID = 0
	if err := db.DB.Create(&in).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": in})
}

func updateNote(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var note models.Note
	if err := db.DB.First(&note, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var in models.Note
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	note.Title = in.Title
	note.Content = in.Content
	if err := db.DB.Save(&note).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": note})
}

func deleteNote(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := db.DB.Delete(&models.Note{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}