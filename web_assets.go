package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// webDistFS holds the built frontend (Vite output under web/dist).
// Build the frontend with `npm run build` (handled by build.sh / restart.sh)
// before running `go build` — otherwise the embed pattern matches nothing.
//
//go:embed all:web/dist
var webDistFS embed.FS

// setupFrontendAssets wires the embedded frontend into the Gin engine:
//
//   - GET /              -> embedded index.html
//   - GET /favicon.svg   -> embedded favicon.svg
//   - GET /assets/*      -> files under embedded web/dist/assets
//   - *                  -> falls back to index.html for SPA routing
//     (API + upload + swagger paths are explicitly registered elsewhere
//      and return their own responses; the NoRoute handler only fires for
//      truly unknown paths.)
func setupFrontendAssets(r *gin.Engine) {
	assetsFS, err := fs.Sub(webDistFS, "web/dist/assets")
	if err != nil {
		log.Fatalf("embedded frontend missing: %v (did you run 'npm run build' in web/?)", err)
	}

	indexBytes, err := webDistFS.ReadFile("web/dist/index.html")
	if err != nil {
		log.Fatalf("embedded web/dist/index.html missing: %v", err)
	}
	faviconBytes, err := webDistFS.ReadFile("web/dist/favicon.svg")
	hasFavicon := err == nil

	serveIndex := func(c *gin.Context) {
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexBytes)
	}

	// StaticFS maps the URL prefix to the FS root: /assets/foo looks up
	// `foo` inside the sub-FS, which we rooted at web/dist/assets. The
	// two must line up — Gin's handler uses c.Param("filepath") as the
	// lookup key, with no prefix knowledge.
	r.StaticFS("/assets", http.FS(assetsFS))

	r.GET("/favicon.svg", func(c *gin.Context) {
		if !hasFavicon {
			c.Status(http.StatusNotFound)
			return
		}
		c.Data(http.StatusOK, "image/svg+xml", faviconBytes)
	})

	r.GET("/", serveIndex)

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		switch {
		case strings.HasPrefix(path, "/api/"):
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		case strings.HasPrefix(path, "/assets/"), path == "/favicon.svg":
			// Gin's StaticFS forwards missing assets to NoRoute after writing 404.
			// Treat them as real 404s so we don't ship index.html for a missing JS chunk.
			c.Status(http.StatusNotFound)
		default:
			serveIndex(c)
		}
	})
}