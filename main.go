package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"mc/cronjobs"
	"mc/datadb"
	"mc/db"
	"mc/handlers"
	"mc/logicmodels"
	"mc/pages"
	"mc/settings"

	"github.com/gin-gonic/gin"
)

func main() {
	port := flag.String("port", envOr("PORT", "8080"), "listen port")
	host := flag.String("host", envOr("HOST", "0.0.0.0"), "listen host")
	dbPath := flag.String("db", envOr("DB_PATH", "data/app.db"), "sqlite db path")
	uploadRoot := flag.String("upload-root", envOr("UPLOAD_ROOT", "data/uploads"), "upload root directory")
	managedDBPath := flag.String("managed-db", envOr("MANAGED_DB_PATH", "data/managed.db"), "default path for the managed sqlite database (overridden by setting center)")
	resetPassword := flag.String("reset-default-user", "", "reset first admin's password and force a change on next login, then exit")
	flag.Parse()

	abs, _ := filepath.Abs(*dbPath)
	if dir := filepath.Dir(abs); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			log.Fatalf("failed to create db dir %s: %v", dir, err)
		}
	}
	db.Init(abs)

	if *resetPassword != "" {
		if err := db.ResetDefaultAdmin(*resetPassword); err != nil {
			log.Fatalf("reset failed: %v", err)
		}
		log.Printf("default admin password has been reset; login will require password change")
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
	if dir := filepath.Dir(absManagedDB); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			log.Fatalf("failed to create managed db dir %s: %v", dir, err)
		}
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

	lmStore := logicmodels.NewStore(mgr)
	pagesStore := pages.NewStore(mgr)

	cronStore := cronjobs.NewStore()
	cronRunner, err := cronjobs.NewRunner(filepath.Join("data", "cron-logs"))
	if err != nil {
		log.Fatalf("failed to init cron runner: %v", err)
	}
	cronScheduler := cronjobs.NewScheduler(cronStore, cronRunner, nil)

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery(), gin.Logger())

	// 日志服务只接受外部主动写入,不自动记录本服务的请求 —— 调用方应自行选择
	// 是直接 POST /api/logs,还是让本服务内置中间件埋点(可在 handlers/logs.go 自行启用)。
	_ = handlers.HTTPRequestLogMiddleware // 保留以备手动启用

	r.GET("/healthz", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	r.GET("/swagger", handlers.SwaggerUI)
	r.GET("/swagger/", handlers.SwaggerUI)
	r.GET("/swagger/index.html", handlers.SwaggerUI)
	r.GET("/swagger/doc.json", handlers.SwaggerJSON)

	setupFrontendAssets(r)

	handlers.Register(r, handlers.Deps{
		Store:       store,
		Manager:     mgr,
		LMStore:     lmStore,
		PagesStore:  pagesStore,
		CronStore:   cronStore,
		CronRunner:  cronRunner,
		CronSched:   cronScheduler,
	})

	// 用 ctx 控制调度器生命周期 —— SIGINT/SIGTERM 触发 stop,run.sh 重启时也能优雅退出。
	schedulerCtx, stopScheduler := context.WithCancel(context.Background())
	defer stopScheduler()
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		stopScheduler()
	}()
	if err := cronScheduler.Start(schedulerCtx); err != nil {
		log.Fatalf("failed to start cron scheduler: %v", err)
	}
	log.Printf("cron scheduler started, logs at %s", cronRunner.LogRoot())

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