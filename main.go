package main

import (
	"flag"
	"log"
	"os"
	"path/filepath"

	"mc/datadb"
	"mc/db"
	"mc/handlers"
	"mc/settings"

	"github.com/gin-gonic/gin"
)

func main() {
	port := flag.String("port", envOr("PORT", "8080"), "listen port")
	host := flag.String("host", envOr("HOST", "0.0.0.0"), "listen host")
	dbPath := flag.String("db", envOr("DB_PATH", "data/app.db"), "sqlite db path")
	staticDir := flag.String("static", envOr("STATIC_DIR", "static"), "static dir")
	uploadRoot := flag.String("upload-root", envOr("UPLOAD_ROOT", "data/uploads"), "upload root directory")
	managedDBPath := flag.String("managed-db", envOr("MANAGED_DB_PATH", "data/managed.db"), "default path for the managed sqlite database (overridden by setting center)")
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

	absUpload, err := filepath.Abs(*uploadRoot)
	if err != nil {
		log.Fatalf("invalid upload root: %v", err)
	}
	if err := os.MkdirAll(absUpload, 0o755); err != nil {
		log.Fatalf("failed to create upload root: %v", err)
	}

	absManagedDB, err := filepath.Abs(*managedDBPath)
	if err != nil {
		log.Fatalf("invalid managed db path: %v", err)
	}

	store := settings.New()
	store.SetDefault(settings.KeyUploadRoot, absUpload)
	store.SetDefault(settings.KeyManagedDBPath, absManagedDB)

	mgr := datadb.NewManager()
	if dbPath := store.GetString(settings.KeyManagedDBPath); dbPath != "" {
		if err := mgr.Load(dbPath); err != nil {
			log.Printf("warning: failed to auto-initialize managed db at %s: %v", dbPath, err)
		} else {
			log.Printf("managed db auto-initialized at %s", dbPath)
		}
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery(), gin.Logger())

	r.Static("/css", filepath.Join(*staticDir, "css"))
	r.Static("/js", filepath.Join(*staticDir, "js"))
	r.Static("/assets", filepath.Join(*staticDir, "assets"))
	r.StaticFile("/favicon.svg", filepath.Join(*staticDir, "favicon.svg"))
	indexPath := filepath.Join(*staticDir, "index.html")
	r.GET("/swagger", handlers.SwaggerUI)
	r.GET("/swagger/", handlers.SwaggerUI)
	r.GET("/swagger/index.html", handlers.SwaggerUI)
	r.GET("/swagger/doc.json", handlers.SwaggerJSON)
	r.StaticFile("/", indexPath)
	r.NoRoute(func(c *gin.Context) {
		if len(c.Request.URL.Path) >= 5 && c.Request.URL.Path[:5] == "/api/" {
			c.JSON(404, gin.H{"error": "not found"})
			return
		}
		c.File(indexPath)
	})
	r.GET("/healthz", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	handlers.Register(r, handlers.Deps{Store: store, Manager: mgr})

	addr := *host + ":" + *port
	log.Printf("listening on %s, db=%s, upload_root=%s, managed_db=%s", addr, abs, store.GetString(settings.KeyUploadRoot), store.GetString(settings.KeyManagedDBPath))
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
