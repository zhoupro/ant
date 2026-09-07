package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const swaggerUIPage = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>API Docs - MC Notes</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; }
    *, *::before, *::after { box-sizing: inherit; }
    body { margin: 0; }
    .swagger-ui .info { margin: 20px 0; }
    .swagger-ui .scheme-container { padding: 15px 0; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/swagger/doc.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis
        ],
        layout: 'BaseLayout'
      });
    };
  </script>
</body>
</html>`

func SwaggerJSON(c *gin.Context) {
	c.JSON(http.StatusOK, openAPISpec())
}

func SwaggerUI(c *gin.Context) {
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(swaggerUIPage))
}

func openAPISpec() gin.H {
	return gin.H{
		"openapi": "3.0.3",
		"info": gin.H{
			"title":       "MC Notes API",
			"description": "HTTP API for the managed database and the logic-model runtime. All endpoints live under `/api`. Authenticated endpoints require the `mc_session` cookie issued by `POST /api/auth/login`. The **logic-models** and **runtime** tag groups are the auto-generated CRUD that the management UI uses.",
			"version":     "1.0.0",
		},
		"servers": []gin.H{
			{"url": "/", "description": "Same-origin"},
		},
		"tags": []gin.H{
			{"name": "auth"},
			{"name": "uploads"},
			{"name": "settings"},
			{"name": "database"},
			{"name": "logic-models"},
			{"name": "runtime"},
{"name": "cron"},
			{"name": "logs"},
		},
		"components": gin.H{
			"securitySchemes": gin.H{
				"cookieAuth": gin.H{
					"type":        "apiKey",
					"in":          "cookie",
					"name":        "mc_session",
					"description": "Session cookie set by /api/auth/login.",
				},
				"bearerAuth": gin.H{
					"type":         "http",
					"scheme":       "bearer",
					"bearerFormat": "opaque",
					"description":  "API token issued by /api/auth/tokens. Send as `Authorization: Bearer <token>`.",
				},
			},
			"schemas": schemas(),
		},
		"security": []gin.H{
			{"cookieAuth": []string{}},
		},
		"paths": buildPaths(),
	}
}

func schemas() gin.H {
	return gin.H{
		"Error":                errorSchema(),
		"User":                 userSchema(),
		"Attachment":           attachmentSchema(),
		"Setting":              settingSchema(),
		"APIToken":             apiTokenSchema(),
		"CreateAPITokenInput":  createAPITokenInputSchema(),
		"CreatedAPIToken":      createdAPITokenEnvelopeSchema(),
		"DBStatus":             dbStatusSchema(),
		"DBColumn":             dbColumnSchema(),
		"TableSchema":          tableSchemaSchema(),
		"RowResponse":          rowResponseSchema(),
		"RowInput":             rowInputSchema(),
		"AddColumnInput":       addColumnInputSchema(),
		"CreateTableInput":     createTableInputSchema(),
		"FieldConfig":          fieldConfigSchema(),
		"TableConfig":          tableConfigSchema(),
		"RelationConfig":       relationConfigSchema(),
		"ModelConfig":          modelConfigSchema(),
		"ModelRecord":          modelRecordSchema(),
		"ModelSummary":         modelSummarySchema(),
		"ModelInput":           modelInputSchema(),
		"AutoModelInput":       autoModelInputSchema(),
		"BusinessType":         businessTypeSchema(),
		"PhysicalTable":        physicalTableSchema(),
		"RuntimeSchema":        runtimeSchemaSchema(),
		"RuntimeTable":         runtimeTableSchema(),
		"RuntimeField":         runtimeFieldSchema(),
		"RuntimeRelation":      runtimeRelationSchema(),
		"RuntimeRowResponse":   runtimeRowResponseSchema(),
		"RuntimeDetail":        runtimeDetailSchema(),
		"ExpandedRow":          expandedRowSchema(),
"CronJob":              cronJobSchema(),
		"CronJobInput":         cronJobInputSchema(),
		"CronJobToggle":        cronJobToggleSchema(),
		"CronJobRun":           cronJobRunSchema(),
		"CronJobRunList":       cronJobRunListSchema(),
		"CronJobRunTrigger":    cronJobRunTriggerSchema(),
		"CronJobLogSlice":      cronJobLogSliceSchema(),
		"Log":                  logSchema(),
		"LogImage":             logImageSchema(),
		"LogListResponse":      logListResponseSchema(),
		"LogInput":             logInputSchema(),
		"LogFacets":            logFacetsSchema(),
	}
}

func errorSchema() gin.H {
	return gin.H{
		"type":     "object",
		"properties": gin.H{
			"error": gin.H{"type": "string"},
		},
		"required": []string{"error"},
	}
}

func envelopeFor(name string) gin.H {
	return gin.H{
		"type": gin.H{"$ref": "#/components/schemas/" + name},
	}
}

func envelopeListOf(name string) gin.H {
	return gin.H{
		"type":  "array",
		"items": gin.H{"$ref": "#/components/schemas/" + name},
	}
}

func userSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"id":                   gin.H{"type": "integer"},
			"username":             gin.H{"type": "string"},
			"must_change_password": gin.H{"type": "boolean"},
			"created_at":           gin.H{"type": "string", "format": "date-time"},
			"updated_at":           gin.H{"type": "string", "format": "date-time"},
		},
	}
}

func attachmentSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"id":            gin.H{"type": "integer"},
			"user_id":       gin.H{"type": "integer"},
			"original_name": gin.H{"type": "string"},
			"size":          gin.H{"type": "integer"},
			"content_type":  gin.H{"type": "string"},
			"url":           gin.H{"type": "string"},
			"created_at":    gin.H{"type": "string", "format": "date-time"},
		},
	}
}

func settingSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"key":        gin.H{"type": "string"},
			"value":      gin.H{"type": "string"},
			"updated_at": gin.H{"type": "string", "format": "date-time"},
		},
	}
}

func apiTokenSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"id":           gin.H{"type": "integer"},
			"user_id":      gin.H{"type": "integer"},
			"name":         gin.H{"type": "string"},
			"prefix":       gin.H{"type": "string", "description": "First 12 chars of the plaintext token; safe to display."},
			"expires_at":   gin.H{"type": "string", "format": "date-time"},
			"last_used_at": gin.H{"type": "string", "format": "date-time"},
			"revoked_at":   gin.H{"type": "string", "format": "date-time"},
			"created_at":   gin.H{"type": "string", "format": "date-time"},
		},
	}
}

func createAPITokenInputSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"name":             gin.H{"type": "string", "description": "Display name. Optional; defaults to '未命名令牌'."},
			"expires_in_days": gin.H{"type": "integer", "description": "Optional. Lifetime in days (1~3650). 0 means no expiry."},
		},
	}
}

func createdAPITokenEnvelopeSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"token": gin.H{"$ref": "#/components/schemas/APIToken"},
			"plain": gin.H{"type": "string", "description": "Plaintext token. Shown only once at creation. Send as `Authorization: Bearer <plain>`."},
		},
		"required": []string{"token", "plain"},
	}
}

func dbStatusSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"loaded": gin.H{"type": "boolean"},
			"path":   gin.H{"type": "string"},
			"name":   gin.H{"type": "string"},
			"size":   gin.H{"type": "integer"},
			"tables": gin.H{"type": "integer"},
			"error":  gin.H{"type": "string"},
		},
	}
}

func dbColumnSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"name":    gin.H{"type": "string"},
			"type":    gin.H{"type": "string"},
			"notnull": gin.H{"type": "boolean"},
			"pk":      gin.H{"type": "boolean"},
			"default": gin.H{"type": "string"},
		},
	}
}

func tableSchemaSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"name":         gin.H{"type": "string"},
			"columns":      gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/DBColumn"}},
			"primary_keys": gin.H{"type": "array", "items": gin.H{"type": "string"}},
		},
	}
}

func rowResponseSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"columns": gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/DBColumn"}},
			"rows":    gin.H{"type": "array", "items": gin.H{"type": "object"}},
			"total":   gin.H{"type": "integer"},
			"limit":   gin.H{"type": "integer"},
			"offset":  gin.H{"type": "integer"},
			"search":  gin.H{"type": "string"},
		},
	}
}

func rowInputSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"values": gin.H{"type": "object", "additionalProperties": true},
		},
		"required": []string{"values"},
	}
}

func addColumnInputSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"name":    gin.H{"type": "string"},
			"type":    gin.H{"type": "string"},
			"notnull": gin.H{"type": "boolean"},
			"default": gin.H{"type": "string"},
		},
		"required": []string{"name", "type"},
	}
}

func createTableInputSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"name":    gin.H{"type": "string"},
			"columns": gin.H{
				"type": "array",
				"items": gin.H{
					"type": "object",
					"properties": gin.H{
						"name":    gin.H{"type": "string"},
						"type":    gin.H{"type": "string"},
						"notnull": gin.H{"type": "boolean"},
						"pk":      gin.H{"type": "boolean"},
						"default": gin.H{"type": "string"},
					},
					"required": []string{"name", "type"},
				},
			},
		},
		"required": []string{"name", "columns"},
	}
}

func fieldConfigSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"key":           gin.H{"type": "string"},
			"physical":      gin.H{"type": "string"},
			"label":         gin.H{"type": "string"},
			"business_type": gin.H{"$ref": "#/components/schemas/BusinessType"},
			"required":      gin.H{"type": "boolean"},
			"editable":      gin.H{"type": "boolean"},
			"list_show":     gin.H{"type": "boolean"},
			"searchable":    gin.H{"type": "boolean"},
			"sort":          gin.H{"type": "integer"},
			"placeholder":   gin.H{"type": "string"},
			"options": gin.H{
				"type": "array",
				"items": gin.H{
					"type": "object",
					"properties": gin.H{
						"label": gin.H{"type": "string"},
						"value": gin.H{"type": "string"},
					},
				},
			},
		},
		"required": []string{"key", "physical", "label", "business_type"},
	}
}

func tableConfigSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"alias":       gin.H{"type": "string"},
			"physical":    gin.H{"type": "string"},
			"label":       gin.H{"type": "string"},
			"primary_key": gin.H{"type": "string"},
			"fields":      gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/FieldConfig"}},
		},
		"required": []string{"alias", "physical", "label", "primary_key", "fields"},
	}
}

func relationConfigSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"id":                gin.H{"type": "string"},
			"type":              gin.H{"type": "string", "enum": []string{"one_to_one", "one_to_many", "many_to_many"}},
			"from_alias":        gin.H{"type": "string"},
			"from_column":       gin.H{"type": "string"},
			"to_alias":          gin.H{"type": "string"},
			"to_column":         gin.H{"type": "string"},
			"join_table":        gin.H{"type": "string"},
			"join_from_column": gin.H{"type": "string"},
			"join_to_column":    gin.H{"type": "string"},
			"label":             gin.H{"type": "string"},
		},
		"required": []string{"id", "type", "from_alias", "from_column", "to_alias", "to_column"},
	}
}

func modelConfigSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"root_alias": gin.H{"type": "string"},
			"tables":     gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/TableConfig"}},
			"relations":  gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/RelationConfig"}},
		},
		"required": []string{"root_alias", "tables", "relations"},
	}
}

func modelRecordSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"slug":        gin.H{"type": "string"},
			"label":       gin.H{"type": "string"},
			"description": gin.H{"type": "string"},
			"config":      gin.H{"type": "string", "description": "JSON-encoded ModelConfig string"},
			"created_at":  gin.H{"type": "string", "format": "date-time"},
			"updated_at":  gin.H{"type": "string", "format": "date-time"},
		},
	}
}

func modelSummarySchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"slug":        gin.H{"type": "string"},
			"label":       gin.H{"type": "string"},
			"description": gin.H{"type": "string"},
			"updated_at":  gin.H{"type": "string"},
		},
	}
}

func modelInputSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"slug":        gin.H{"type": "string"},
			"label":       gin.H{"type": "string"},
			"description": gin.H{"type": "string"},
			"config":      gin.H{"$ref": "#/components/schemas/ModelConfig"},
		},
		"required": []string{"slug", "label", "config"},
	}
}

func autoModelInputSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"physical": gin.H{"type": "string", "description": "Physical table name to auto-configure from"},
			"slug":     gin.H{"type": "string", "description": "Optional override for the model slug (defaults to `auto_<physical>`)"},
			"label":    gin.H{"type": "string", "description": "Optional override for the model label"},
		},
		"required": []string{"physical"},
	}
}

func businessTypeSchema() gin.H {
	return gin.H{
		"type": "string",
		"enum": []string{
			"text", "longtext", "number", "integer", "boolean", "date", "datetime",
			"image", "images", "file", "json", "richtext", "select", "multiselect",
			"url", "email", "phone", "color",
		},
	}
}

func physicalTableSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"name":         gin.H{"type": "string"},
			"columns":      gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/DBColumn"}},
			"primary_keys": gin.H{"type": "array", "items": gin.H{"type": "string"}},
			"foreign_keys": gin.H{"type": "array", "items": gin.H{"type": "object"}},
		},
	}
}

func runtimeSchemaSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"slug":           gin.H{"type": "string"},
			"label":          gin.H{"type": "string"},
			"description":    gin.H{"type": "string"},
			"root_alias":     gin.H{"type": "string"},
			"tables":         gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/RuntimeTable"}},
			"relations":      gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/RuntimeRelation"}},
			"business_types": gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/BusinessType"}},
			"updated_at":     gin.H{"type": "string"},
		},
	}
}

func runtimeTableSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"alias":       gin.H{"type": "string"},
			"physical":    gin.H{"type": "string"},
			"label":       gin.H{"type": "string"},
			"primary_key": gin.H{"type": "string"},
			"fields":      gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/RuntimeField"}},
		},
	}
}

func runtimeFieldSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"key":           gin.H{"type": "string"},
			"physical":      gin.H{"type": "string"},
			"label":         gin.H{"type": "string"},
			"business_type": gin.H{"$ref": "#/components/schemas/BusinessType"},
			"required":      gin.H{"type": "boolean"},
			"editable":      gin.H{"type": "boolean"},
			"list_show":     gin.H{"type": "boolean"},
			"searchable":    gin.H{"type": "boolean"},
			"sort":          gin.H{"type": "integer"},
			"placeholder":   gin.H{"type": "string"},
			"options":       gin.H{"type": "array", "items": gin.H{"type": "object"}},
		},
	}
}

func runtimeRelationSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"id":                gin.H{"type": "string"},
			"type":              gin.H{"type": "string", "enum": []string{"one_to_one", "one_to_many", "many_to_many"}},
			"from_alias":        gin.H{"type": "string"},
			"from_column":       gin.H{"type": "string"},
			"to_alias":          gin.H{"type": "string"},
			"to_column":         gin.H{"type": "string"},
			"join_table":        gin.H{"type": "string"},
			"join_from_column": gin.H{"type": "string"},
			"join_to_column":    gin.H{"type": "string"},
			"label":             gin.H{"type": "string"},
		},
	}
}

func runtimeRowResponseSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"fields":  gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/RuntimeField"}},
			"rows":    gin.H{"type": "array", "items": gin.H{"type": "object"}},
			"total":   gin.H{"type": "integer"},
			"limit":   gin.H{"type": "integer"},
			"offset":  gin.H{"type": "integer"},
			"search":  gin.H{"type": "string"},
			"primary": gin.H{"type": "string"},
			"slug":    gin.H{"type": "string"},
			"label":   gin.H{"type": "string"},
		},
	}
}

func runtimeDetailSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"row":       gin.H{"type": "object"},
			"relations": gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/ExpandedRow"}},
			"primary":   gin.H{"type": "string"},
		},
	}
}

func expandedRowSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"id":     gin.H{"type": "string"},
			"type":   gin.H{"type": "string", "enum": []string{"one_to_one", "one_to_many", "many_to_many"}},
			"label":  gin.H{"type": "string"},
			"target": gin.H{"type": "string"},
			"join":   gin.H{"type": "string"},
			"rows":   gin.H{"type": "array", "items": gin.H{"type": "object"}},
		},
	}
}

func cronJobSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"id":          gin.H{"type": "integer"},
			"name":        gin.H{"type": "string"},
			"description": gin.H{"type": "string"},
			"cron_expr":   gin.H{"type": "string", "description": "Standard 5-field cron expression. Supports descriptors like @hourly, @daily."},
			"command":     gin.H{"type": "string", "description": "Shell script passed to /bin/sh -c."},
			"enabled":     gin.H{"type": "boolean"},
			"created_by":  gin.H{"type": "string"},
			"updated_by":  gin.H{"type": "string"},
			"created_at":  gin.H{"type": "string", "format": "date-time"},
			"updated_at":  gin.H{"type": "string", "format": "date-time"},
			"last_run_at": gin.H{"type": "string", "format": "date-time"},
			"last_status": gin.H{"type": "string", "enum": []string{"running", "success", "failed", "canceled", ""}},
			"next_run_at": gin.H{"type": "string", "format": "date-time"},
		},
		"required": []string{"id", "name", "cron_expr", "command", "enabled"},
	}
}

func cronJobInputSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"name":        gin.H{"type": "string", "description": "Display name. Required, max 128 chars."},
			"description": gin.H{"type": "string", "description": "Optional, max 512 chars."},
			"cron_expr":   gin.H{"type": "string", "description": "Standard 5-field cron expression. Required."},
			"command":     gin.H{"type": "string", "description": "Shell script executed by /bin/sh -c. Required."},
			"enabled":     gin.H{"type": "boolean", "description": "Defaults to true if omitted."},
		},
		"required": []string{"name", "cron_expr", "command"},
	}
}

func cronJobToggleSchema() gin.H {
	return gin.H{
		"type":     "object",
		"properties": gin.H{
			"enabled": gin.H{"type": "boolean"},
		},
		"required": []string{"enabled"},
	}
}

func cronJobRunSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"id":               gin.H{"type": "integer"},
			"job_id":           gin.H{"type": "integer"},
			"status":           gin.H{"type": "string", "enum": []string{"running", "success", "failed", "canceled"}},
			"is_running":       gin.H{"type": "boolean", "description": "True when the underlying shell process is still alive."},
			"trigger":          gin.H{"type": "string", "enum": []string{"schedule", "manual"}},
			"exit_code":        gin.H{"type": "integer"},
			"error":            gin.H{"type": "string"},
			"started_at":       gin.H{"type": "string", "format": "date-time"},
			"finished_at":      gin.H{"type": "string", "format": "date-time"},
			"duration_ms":      gin.H{"type": "integer"},
			"stdout_preview":   gin.H{"type": "string", "description": "Tail of stdout, up to ~8 KiB."},
			"stderr_preview":   gin.H{"type": "string", "description": "Tail of stderr, up to ~8 KiB."},
			"stdout_truncated": gin.H{"type": "boolean"},
			"stderr_truncated": gin.H{"type": "boolean"},
			"stdout_size":      gin.H{"type": "integer"},
			"stderr_size":      gin.H{"type": "integer"},
			"log_path":         gin.H{"type": "string", "description": "Relative path under the run logs root."},
			"created_by":       gin.H{"type": "string"},
		},
		"required": []string{"id", "job_id", "status", "trigger", "started_at"},
	}
}

func cronJobRunListSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"runs":   gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/CronJobRun"}},
			"total":  gin.H{"type": "integer"},
			"limit":  gin.H{"type": "integer"},
			"offset": gin.H{"type": "integer"},
		},
	}
}

func cronJobRunTriggerSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"run_id": gin.H{"type": "integer", "description": "ID of the newly created run record."},
		},
	}
}

func cronJobLogSliceSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"content":   gin.H{"type": "string", "description": "UTF-8 decoded log chunk."},
			"offset":    gin.H{"type": "integer", "description": "Byte offset of this chunk within the log file."},
			"next":      gin.H{"type": "integer", "description": "Byte offset to pass for the next call."},
			"size":      gin.H{"type": "integer", "description": "Total size of the log file in bytes."},
			"truncated": gin.H{"type": "boolean", "description": "True when stdout/stderr were capped at the runner level."},
			"has_more":  gin.H{"type": "boolean", "description": "True when more bytes remain after this chunk."},
		},
	}
}

func buildPaths() gin.H {
	p := gin.H{}
	addAuthPaths(p)
	addUploadPaths(p)
	addSettingsPaths(p)
	addDBFilePaths(p)
	addTablesPaths(p)
	addLogicModelsPaths(p)
	addRuntimePaths(p)
addCronPaths(p)
	addLogsPaths(p)
	return p
}

func addAuthPaths(p gin.H) {
	p["/api/auth/login"] = gin.H{
		"post": op("auth", "Log in", "Issue a session cookie via the `mc_session` cookie.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{
				"type": "object",
				"properties": gin.H{
					"username": gin.H{"type": "string"},
					"password": gin.H{"type": "string"},
				},
				"required": []string{"username", "password"},
			}},
		}, []gin.H{okResp("Sets the `mc_session` cookie."), errResp()}),
	}
	p["/api/auth/logout"] = gin.H{
		"post": op("auth", "Log out", "Invalidate the current session.", nil, []gin.H{okResp("Session ended."), errResp()}),
	}
	p["/api/auth/me"] = gin.H{
		"get": op("auth", "Current user", "Return the currently authenticated user.", nil, []gin.H{okResp("The current user."), errResp()}),
	}
	p["/api/auth/change-password"] = gin.H{
		"post": op("auth", "Change password", "Change the current user's password and optionally update the username.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{
				"type": "object",
				"properties": gin.H{
					"old_password": gin.H{"type": "string"},
					"new_password": gin.H{"type": "string"},
					"new_username": gin.H{"type": "string", "description": "Optional. 2~64 chars; must be unique."},
				},
				"required": []string{"old_password", "new_password"},
			}},
		}, []gin.H{okResp("The updated user."), errResp()}),
	}
	apiTokenListResp := gin.H{"code": "200", "desc": "List of API tokens owned by the current user.", "schema": gin.H{
		"type": "array",
		"items": gin.H{"$ref": "#/components/schemas/APIToken"},
	}}
	p["/api/auth/tokens"] = gin.H{
		"get": op("auth", "List API tokens", "List API tokens owned by the current user. Plaintexts are never returned.", nil, []gin.H{apiTokenListResp, errResp()}),
		"post": op("auth", "Create API token", "Issue a new API token. The plaintext is returned in this response and remains retrievable via `GET /api/auth/tokens/{id}/plain` afterwards. Use it as `Authorization: Bearer <plain>`.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{"$ref": "#/components/schemas/CreateAPITokenInput"}},
		}, []gin.H{
			{"code": "200", "desc": "Created token with one-time plaintext.", "schema": gin.H{"$ref": "#/components/schemas/CreatedAPIToken"}},
			errResp(),
		}),
	}
	p["/api/auth/tokens/{id}/plain"] = gin.H{
		"parameters": []gin.H{{"name": "id", "in": "path", "required": true, "type": "integer"}},
		"get": op("auth", "Reveal API token plaintext", "Return the stored plaintext for an existing token so the caller can copy it. Available for tokens created after the reveal feature was enabled.", nil, []gin.H{okResp("Plaintext plus revoked/expired flags."), errResp()}),
	}
	p["/api/auth/tokens/{id}"] = gin.H{
		"parameters": []gin.H{{"name": "id", "in": "path", "required": true, "type": "integer"}},
		"delete": op("auth", "Revoke API token", "Revoke an API token by id. The token can no longer be used for authentication.", nil, []gin.H{okResp("Revocation result."), errResp()}),
	}
}

func addUploadPaths(p gin.H) {
	p["/api/uploads"] = gin.H{
		"get": op("uploads", "List uploads", "List uploads owned by the current user.", nil, []gin.H{
			okResp("List of attachments."),
			errResp(),
		}),
		"post": op("uploads", "Upload file", "Upload a file via multipart/form-data with field `file`.", []gin.H{
			{"name": "file", "in": "formData", "type": "file", "required": true},
		}, []gin.H{okResp("The created attachment record."), errResp()}),
	}
	p["/api/uploads/{id}"] = gin.H{
		"parameters": []gin.H{{"name": "id", "in": "path", "required": true, "type": "integer"}},
		"get": op("uploads", "Serve upload", "Stream the uploaded file. Public; no auth required.", nil, []gin.H{
			okResp("Binary body."),
			errResp(),
		}),
		"delete": op("uploads", "Delete upload", "Delete an upload owned by the current user.", nil, []gin.H{
			okResp("Deletion result."),
			errResp(),
		}),
	}
}

func addSettingsPaths(p gin.H) {
	p["/api/settings"] = gin.H{
		"get": op("settings", "List settings", "List all stored settings plus defaults.", nil, []gin.H{
			okResp("List of settings."),
			errResp(),
		}),
		"put": op("settings", "Update setting", "Update or create a setting. Body: `{ \"key\": \"...\", \"value\": \"...\" }`.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{
				"type": "object",
				"properties": gin.H{
					"key":   gin.H{"type": "string"},
					"value": gin.H{"type": "string"},
				},
				"required": []string{"key", "value"},
			}},
		}, []gin.H{okResp("The updated setting."), errResp()}),
	}
}

func addDBFilePaths(p gin.H) {
	p["/api/dbfile/status"] = gin.H{
		"get": op("database", "DB status", "Status of the currently managed database.", nil, []gin.H{
			okResp("Status of the managed database."),
			errResp(),
		}),
	}
}

func addTablesPaths(p gin.H) {
	p["/api/tables"] = gin.H{
		"get": op("database", "List tables", "List physical tables in the managed database.", nil, []gin.H{
			okResp("List of table names."),
			errResp(),
		}),
		"post": op("database", "Create table", "Create a new physical table.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{"$ref": "#/components/schemas/CreateTableInput"}},
		}, []gin.H{okResp("The created table's name and SQL."), errResp()}),
	}
	p["/api/tables/{name}"] = gin.H{
		"parameters": []gin.H{{"name": "name", "in": "path", "required": true, "type": "string"}},
		"delete": op("database", "Drop table", "Drop a physical table.", nil, []gin.H{okResp("Deletion result."), errResp()}),
	}
	p["/api/tables/{name}/schema"] = gin.H{
		"parameters": []gin.H{{"name": "name", "in": "path", "required": true, "type": "string"}},
		"get": op("database", "Get table schema", "Column info for a physical table.", nil, []gin.H{
			okResp("Schema for the requested table."),
			errResp(),
		}),
	}
	p["/api/tables/{name}/columns"] = gin.H{
		"parameters": []gin.H{{"name": "name", "in": "path", "required": true, "type": "string"}},
		"post": op("database", "Add column", "Append a column to a physical table.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{"$ref": "#/components/schemas/AddColumnInput"}},
		}, []gin.H{okResp("Added column info."), errResp()}),
	}
	p["/api/tables/{name}/rows"] = gin.H{
		"parameters": []gin.H{
			{"name": "name", "in": "path", "required": true, "type": "string"},
			{"name": "limit", "in": "query", "type": "integer", "default": 50},
			{"name": "offset", "in": "query", "type": "integer", "default": 0},
			{"name": "search", "in": "query", "type": "string"},
		},
		"get": op("database", "List rows", "List rows for a physical table. Supports `limit`, `offset`, and `search` (LIKE across all columns).", nil, []gin.H{
			okResp("Paginated rows."),
			errResp(),
		}),
		"post": op("database", "Insert row", "Insert a single row.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{"$ref": "#/components/schemas/RowInput"}},
		}, []gin.H{okResp("Insertion result."), errResp()}),
	}
	p["/api/tables/{name}/rows/{pk}"] = gin.H{
		"parameters": []gin.H{
			{"name": "name", "in": "path", "required": true, "type": "string"},
			{"name": "pk", "in": "path", "required": true, "type": "string"},
		},
		"get": op("database", "Get row", "Fetch a single row by primary key (composite keys joined by `__`).", nil, []gin.H{
			okResp("Single row as an object."),
			errResp(),
		}),
		"put": op("database", "Update row", "Update fields of a row by primary key.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{"$ref": "#/components/schemas/RowInput"}},
		}, []gin.H{okResp("Update result."), errResp()}),
		"delete": op("database", "Delete row", "Delete a row by primary key.", nil, []gin.H{okResp("Deletion result."), errResp()}),
	}
}

func addLogicModelsPaths(p gin.H) {
	p["/api/models"] = gin.H{
		"get": op("logic-models", "List models", "List configured logic models.", nil, []gin.H{
			okResp("List of model summaries."),
			errResp(),
		}),
		"post": op("logic-models", "Upsert model (slug from body)", "Create or update a model. Use the slug from the body.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{"$ref": "#/components/schemas/ModelInput"}},
		}, []gin.H{okResp("The saved model record."), errResp()}),
	}
	p["/api/models/auto"] = gin.H{
		"post": op("logic-models", "Auto-create model from table", "Generate a default model for a single physical table.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{"$ref": "#/components/schemas/AutoModelInput"}},
		}, []gin.H{okResp("The auto-generated model record."), errResp()}),
	}
	p["/api/models/business-types"] = gin.H{
		"get": op("logic-models", "List business types", "All business types usable in field config.", nil, []gin.H{
			okResp("List of business type info."),
			errResp(),
		}),
	}
	p["/api/models/tables"] = gin.H{
		"get": op("logic-models", "List physical tables", "List physical tables with column info from the managed DB.", nil, []gin.H{
			okResp("List of physical tables."),
			errResp(),
		}),
	}
	p["/api/models/tables/{name}/schema"] = gin.H{
		"parameters": []gin.H{{"name": "name", "in": "path", "required": true, "type": "string"}},
		"get": op("logic-models", "Get physical table schema", "Single physical table's column info.", nil, []gin.H{
			okResp("Physical table info."),
			errResp(),
		}),
	}
	p["/api/models/{slug}"] = gin.H{
		"parameters": []gin.H{{"name": "slug", "in": "path", "required": true, "type": "string"}},
		"get": op("logic-models", "Get model", "Get a model by slug. `config` is a JSON-encoded string.", nil, []gin.H{
			okResp("Model record."),
			errResp(),
		}),
		"put": op("logic-models", "Upsert model (slug from path)", "Create or update using the slug in the path.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{"$ref": "#/components/schemas/ModelInput"}},
		}, []gin.H{okResp("Model record."), errResp()}),
		"delete": op("logic-models", "Delete model", "Delete a model by slug.", nil, []gin.H{okResp("Deletion result."), errResp()}),
	}
}

func addRuntimePaths(p gin.H) {
	slugParam := []gin.H{{"name": "slug", "in": "path", "required": true, "type": "string"}}
	pkParam := []gin.H{{"name": "pk", "in": "path", "required": true, "type": "string"}}

	p["/api/runtime/{slug}/schema"] = gin.H{
		"parameters": slugParam,
		"get": op("runtime", "Get runtime schema", "Resolved runtime schema with field business types and relations. Belongs_to relations are LEFT-JOINed in list responses.", nil, []gin.H{
			okResp("Runtime schema."),
			errResp(),
		}),
	}
	p["/api/runtime/{slug}/rows"] = gin.H{
		"parameters": append([]gin.H{
			{"name": "limit", "in": "query", "type": "integer", "default": 50},
			{"name": "offset", "in": "query", "type": "integer", "default": 0},
			{"name": "search", "in": "query", "type": "string"},
		}, slugParam...),
		"get": op("runtime", "List rows", "List rows for the model's root table. Includes joined related-table fields via LEFT JOIN. `fields[].physical` is the actual SQL column; `__rel_<id>_<key>` is a joined column.", nil, []gin.H{
			okResp("Rows with related columns joined."),
			errResp(),
		}),
		"post": op("runtime", "Insert row", "Insert a root-table row. For many-to-many relations, include `relations[relId] = [id1, id2]` to link existing related IDs.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{
				"type": "object",
				"properties": gin.H{
					"values":    gin.H{"type": "object", "additionalProperties": true},
					"relations": gin.H{
						"type": "object",
						"description": "Map of m2m relation id -> list of existing related row IDs to link.",
						"additionalProperties": gin.H{
							"type":  "array",
							"items": gin.H{"oneOf": []gin.H{{"type": "integer"}, {"type": "string"}}},
						},
					},
				},
				"required": []string{"values"},
			}},
		}, []gin.H{okResp("Inserted row id."), errResp()}),
	}
	p["/api/runtime/{slug}/rows/{pk}"] = gin.H{
		"parameters": append([]gin.H{}, append(slugParam, pkParam...)...),
		"get": op("runtime", "Get row detail", "Single row plus expanded related rows.", nil, []gin.H{
			okResp("Row with relations expanded."),
			errResp(),
		}),
		"put": op("runtime", "Update row", "Update editable fields of a root row.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{
				"type": "object",
				"properties": gin.H{
					"values":    gin.H{"type": "object", "additionalProperties": true},
					"relations": gin.H{
						"type": "object",
						"additionalProperties": gin.H{
							"type":  "array",
							"items": gin.H{"oneOf": []gin.H{{"type": "integer"}, {"type": "string"}}},
						},
					},
				},
				"required": []string{"values"},
			}},
		}, []gin.H{okResp("Update result."), errResp()}),
		"delete": op("runtime", "Delete row", "Delete a row. Joins in m2m relations are also cleaned up.", nil, []gin.H{okResp("Deletion result."), errResp()}),
	}
}

func addCronPaths(p gin.H) {
	jobParam := []gin.H{{"name": "id", "in": "path", "required": true, "type": "integer"}}
	runParam := []gin.H{{"name": "runId", "in": "path", "required": true, "type": "integer"}}

	p["/api/cronjobs"] = gin.H{
		"get": op("cron", "List cron jobs", "List all scheduled jobs.", nil, []gin.H{
			okResp("List of cron jobs."),
			errResp(),
		}),
		"post": op("cron", "Create cron job", "Create a new scheduled shell job.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{"$ref": "#/components/schemas/CronJobInput"}},
		}, []gin.H{
			{"code": "200", "desc": "The created job.", "schema": gin.H{"$ref": "#/components/schemas/CronJob"}},
			errResp(),
		}),
	}
	p["/api/cronjobs/{id}"] = gin.H{
		"parameters": jobParam,
		"get": op("cron", "Get cron job", "Fetch a single cron job by id.", nil, []gin.H{
			{"code": "200", "desc": "The job.", "schema": gin.H{"$ref": "#/components/schemas/CronJob"}},
			errResp(),
		}),
		"put": op("cron", "Update cron job", "Replace the cron expression / command / metadata of a job.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{"$ref": "#/components/schemas/CronJobInput"}},
		}, []gin.H{
			{"code": "200", "desc": "The updated job.", "schema": gin.H{"$ref": "#/components/schemas/CronJob"}},
			errResp(),
		}),
		"delete": op("cron", "Delete cron job", "Delete a job and all of its run history.", nil, []gin.H{
			okResp("Deletion result."),
			errResp(),
		}),
	}
	p["/api/cronjobs/{id}/toggle"] = gin.H{
		"parameters": jobParam,
		"post": op("cron", "Toggle cron job", "Enable or disable a cron job without modifying its definition.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{"$ref": "#/components/schemas/CronJobToggle"}},
		}, []gin.H{
			{"code": "200", "desc": "The updated job.", "schema": gin.H{"$ref": "#/components/schemas/CronJob"}},
			errResp(),
		}),
	}
	p["/api/cronjobs/{id}/run"] = gin.H{
		"parameters": jobParam,
		"post": op("cron", "Trigger run now", "Run the cron job immediately, regardless of its schedule.", nil, []gin.H{
			{"code": "200", "desc": "The new run id.", "schema": gin.H{"$ref": "#/components/schemas/CronJobRunTrigger"}},
			errResp(),
		}),
	}
	p["/api/cronjobs/{id}/runs"] = gin.H{
		"parameters": append([]gin.H{
			{"name": "limit", "in": "query", "type": "integer", "default": 50},
			{"name": "offset", "in": "query", "type": "integer", "default": 0},
		}, jobParam...),
		"get": op("cron", "List runs", "Paginated run history for the job.", nil, []gin.H{
			{"code": "200", "desc": "Run history.", "schema": gin.H{"$ref": "#/components/schemas/CronJobRunList"}},
			errResp(),
		}),
	}
	p["/api/cronjobs/{id}/runs/{runId}"] = gin.H{
		"parameters": append([]gin.H{}, append(jobParam, runParam...)...),
		"get": op("cron", "Get run detail", "Single run record including stdout/stderr previews and log path.", nil, []gin.H{
			{"code": "200", "desc": "The run.", "schema": gin.H{"$ref": "#/components/schemas/CronJobRun"}},
			errResp(),
		}),
	}
	p["/api/cronjobs/{id}/runs/{runId}/log"] = gin.H{
		"parameters": append([]gin.H{
			{"name": "offset", "in": "query", "type": "integer", "default": 0},
			{"name": "limit", "in": "query", "type": "integer", "default": 65536},
		}, append(jobParam, runParam...)...),
		"get": op("cron", "Read run log", "Read a chunk of the run's stdout/stderr log file.", nil, []gin.H{
			{"code": "200", "desc": "Log chunk.", "schema": gin.H{"$ref": "#/components/schemas/CronJobLogSlice"}},
			errResp(),
		}),
	}
	p["/api/cronjobs/{id}/runs/{runId}/cancel"] = gin.H{
		"parameters": append([]gin.H{}, append(jobParam, runParam...)...),
		"post": op("cron", "Cancel running run", "Best-effort cancel of a still-running shell process.", nil, []gin.H{
			okResp("Cancel result."),
			errResp(),
		}),
	}
}

func op(tag, summary, description string, parameters []gin.H, responses []gin.H) gin.H {
	o := gin.H{
		"tags":        []string{tag},
		"summary":     summary,
		"description": description,
		"responses":   gin.H{},
		"security":    []gin.H{{"cookieAuth": []string{}}},
	}
	if len(parameters) > 0 {
		o["parameters"] = parameters
	}
	for _, r := range responses {
		code := r["code"].(string)
		desc := r["desc"].(string)
		o["responses"].(gin.H)[code] = gin.H{
			"description": desc,
		}
		if schemaName, ok := r["schemaName"].(string); ok && schemaName != "" {
			o["responses"].(gin.H)[code] = gin.H{
				"description": desc,
				"content": gin.H{
					"application/json": gin.H{
						"schema": gin.H{"$ref": "#/components/schemas/" + schemaName},
					},
				},
			}
		} else if schema, ok := r["schema"].(gin.H); ok {
			o["responses"].(gin.H)[code] = gin.H{
				"description": desc,
				"content": gin.H{
					"application/json": gin.H{
						"schema": schema,
					},
				},
			}
		}
	}
	return o
}

func okResp(description string) gin.H {
	return gin.H{"code": "200", "desc": description}
}

func errResp() gin.H {
	return gin.H{"code": "400", "desc": "Bad request or not found.", "schema": gin.H{"$ref": "#/components/schemas/Error"}}
}

var _ = strings.Builder{}
var _ = http.StatusOK

func logSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"id":          gin.H{"type": "integer"},
			"level":       gin.H{"type": "string", "enum": []string{"debug", "info", "warn", "error"}},
			"source":      gin.H{"type": "string", "description": "Origin of the log entry (manual, http, auth, system, ...)."},
			"title":       gin.H{"type": "string"},
			"message":     gin.H{"type": "string"},
			"user_id":     gin.H{"type": "integer", "nullable": true},
			"user_kind":   gin.H{"type": "string", "enum": []string{"admin", "regular"}},
			"username":    gin.H{"type": "string"},
			"method":      gin.H{"type": "string"},
			"path":        gin.H{"type": "string"},
			"status_code": gin.H{"type": "integer", "nullable": true},
			"ip":          gin.H{"type": "string"},
			"user_agent":  gin.H{"type": "string"},
			"duration_ms": gin.H{"type": "integer", "nullable": true},
			"metadata":    gin.H{"type": "object", "additionalProperties": true, "nullable": true},
			"images":      gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/LogImage"}},
			"created_at":  gin.H{"type": "string", "format": "date-time"},
		},
	}
}

func logImageSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"id":            gin.H{"type": "integer"},
			"original_name": gin.H{"type": "string"},
			"size":          gin.H{"type": "integer"},
			"content_type":  gin.H{"type": "string"},
			"url":           gin.H{"type": "string"},
			"created_at":    gin.H{"type": "string", "format": "date-time"},
		},
	}
}

func logInputSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"level":     gin.H{"type": "string", "enum": []string{"debug", "info", "warn", "error"}, "default": "info"},
			"source":    gin.H{"type": "string", "description": "Optional. Defaults to 'manual'."},
			"title":     gin.H{"type": "string", "maxLength": 255},
			"message":   gin.H{"type": "string"},
			"metadata":  gin.H{"type": "object", "additionalProperties": true, "nullable": true},
			"image_ids": gin.H{"type": "array", "items": gin.H{"type": "integer"}, "description": "Attachment IDs (images) to attach to the log entry."},
		},
		"required": []string{"title"},
	}
}

func logFacetsSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"levels":  gin.H{"type": "array", "items": gin.H{"type": "string"}},
			"sources": gin.H{"type": "array", "items": gin.H{"type": "string"}},
		},
	}
}

func logListResponseSchema() gin.H {
	return gin.H{
		"type": "object",
		"properties": gin.H{
			"items":   gin.H{"type": "array", "items": gin.H{"$ref": "#/components/schemas/Log"}},
			"total":   gin.H{"type": "integer"},
			"limit":   gin.H{"type": "integer"},
			"offset":  gin.H{"type": "integer"},
			"levels":  gin.H{"type": "array", "items": gin.H{"type": "string"}},
			"sources": gin.H{"type": "array", "items": gin.H{"type": "string"}},
		},
	}
}

func addLogsPaths(p gin.H) {
	p["/api/logs"] = gin.H{
		"parameters": []gin.H{
			{"name": "level", "in": "query", "type": "string", "description": "Filter by level (debug/info/warn/error)."},
			{"name": "source", "in": "query", "type": "string"},
			{"name": "search", "in": "query", "type": "string", "description": "LIKE search across title and message."},
			{"name": "limit", "in": "query", "type": "integer", "default": 50, "maximum": 200},
			{"name": "offset", "in": "query", "type": "integer", "default": 0},
			{"name": "order", "in": "query", "type": "string", "enum": []string{"asc", "desc"}, "default": "desc"},
		},
		"get": op("logs", "List logs", "List log entries. Newest first. Returns the items plus filter facets.", nil, []gin.H{
			okResp("Log list with facets."),
			errResp(),
		}),
		"post": op("logs", "Create log entry", "Create a new log entry manually. Useful for capturing screenshots or annotations.", []gin.H{
			{"name": "body", "in": "body", "required": true, "schema": gin.H{"$ref": "#/components/schemas/LogInput"}},
		}, []gin.H{okResp("The created log entry."), errResp()}),
		"delete": op("logs", "Clear all logs", "Delete every log entry and their image bindings.", nil, []gin.H{okResp("Clear result."), errResp()}),
	}
	p["/api/logs/facets"] = gin.H{
		"get": op("logs", "Log facets", "Available levels and known sources for the filter dropdowns.", nil, []gin.H{okResp("Facets."), errResp()}),
	}
	p["/api/logs/{id}"] = gin.H{
		"parameters": []gin.H{{"name": "id", "in": "path", "required": true, "type": "integer"}},
		"get": op("logs", "Get log entry", "Fetch a single log entry with attached images.", nil, []gin.H{okResp("Log entry."), errResp()}),
		"delete": op("logs", "Delete log entry", "Delete one log entry and its image bindings.", nil, []gin.H{okResp("Deletion result."), errResp()}),
	}
}