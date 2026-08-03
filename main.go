package main

import (
	"flag"
	"log"
	"os"
	"path/filepath"

	"mc/db"
	"mc/handlers"

	"github.com/gin-gonic/gin"
)

func main() {
	port := flag.String("port", envOr("PORT", "8080"), "listen port")
	host := flag.String("host", envOr("HOST", "0.0.0.0"), "listen host")
	dbPath := flag.String("db", envOr("DB_PATH", "data/app.db"), "sqlite db path")
	staticDir := flag.String("static", envOr("STATIC_DIR", "static"), "static dir")
	resetPassword := flag.String("reset-default-user", "", "reset default user 'test' to this password (also forces change on next login), then exit")
	flag.Parse()

	abs, _ := filepath.Abs(*dbPath)
	db.Init(abs)

	if *resetPassword != "" {
		if err := db.ResetDefaultUser(*resetPassword); err != nil {
			log.Fatalf("reset failed: %v", err)
		}
		log.Printf("default user 'test' password has been reset; login will require password change")
		return
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery(), gin.Logger())

	r.Static("/css", filepath.Join(*staticDir, "css"))
	r.Static("/js", filepath.Join(*staticDir, "js"))
	r.Static("/assets", filepath.Join(*staticDir, "assets"))
	r.StaticFile("/favicon.svg", filepath.Join(*staticDir, "favicon.svg"))
	indexPath := filepath.Join(*staticDir, "index.html")
	r.StaticFile("/", indexPath)
	r.NoRoute(func(c *gin.Context) {
		if len(c.Request.URL.Path) >= 5 && c.Request.URL.Path[:5] == "/api/" {
			c.JSON(404, gin.H{"error": "not found"})
			return
		}
		c.File(indexPath)
	})
	r.GET("/healthz", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	handlers.Register(r)

	addr := *host + ":" + *port
	log.Printf("listening on %s, db=%s", addr, abs)
	if err := r.Run(addr); err != nil {
		log.Fatal(err)
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}