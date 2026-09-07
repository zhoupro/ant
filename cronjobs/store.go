package cronjobs

import (
	"errors"
	"strings"
	"time"

	"mc/db"
	"mc/models"

	"gorm.io/gorm"
)

// Store 封装 cron_jobs / cron_job_runs 两表的全部读写。
// 所有方法都是阻塞同步的,适合在 HTTP handler / scheduler goroutine 中直接调用。
type Store struct{}

// NewStore 仅是符号化的构造函数,方便后续注入 db 句柄或其他配置。
func NewStore() *Store { return &Store{} }

// ListJobs 返回所有任务定义,按 id 升序,便于 UI 渲染。
func (s *Store) ListJobs() ([]models.CronJob, error) {
	var rows []models.CronJob
	if err := db.DB.Order("id asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// ListEnabledJobs 用于 scheduler 启动时载入当前所有启用的任务。
func (s *Store) ListEnabledJobs() ([]models.CronJob, error) {
	var rows []models.CronJob
	if err := db.DB.Where("enabled = ?", true).Order("id asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Store) GetJob(id uint) (*models.CronJob, error) {
	var row models.CronJob
	if err := db.DB.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

// CreateJob 直接插入新任务,要求业务层先校验字段。
func (s *Store) CreateJob(job *models.CronJob) error {
	if job == nil {
		return errors.New("job 为空")
	}
	if job.Name == "" || job.CronExpr == "" || job.Command == "" {
		return errors.New("任务名称、cron 表达式与命令均为必填")
	}
	return db.DB.Create(job).Error
}

// UpdateJob 修改任务定义。cron 表达式、命令或启用状态变更时,scheduler
// 会自动重启对应的 Entry,因此这里直接保存即可。
func (s *Store) UpdateJob(id uint, fields map[string]any) (*models.CronJob, error) {
	if id == 0 {
		return nil, errors.New("缺少任务 id")
	}
	if _, ok := fields["cron_expr"]; ok {
		expr, _ := fields["cron_expr"].(string)
		if expr == "" {
			return nil, errors.New("cron 表达式不能为空")
		}
	}
	if _, ok := fields["command"]; ok {
		cmd, _ := fields["command"].(string)
		if strings.TrimSpace(cmd) == "" {
			return nil, errors.New("shell 命令不能为空")
		}
	}
	if _, ok := fields["name"]; ok {
		name, _ := fields["name"].(string)
		if strings.TrimSpace(name) == "" {
			return nil, errors.New("任务名称不能为空")
		}
	}
	fields["updated_at"] = time.Now()
	if err := db.DB.Model(&models.CronJob{}).Where("id = ?", id).Updates(fields).Error; err != nil {
		return nil, err
	}
	return s.GetJob(id)
}

func (s *Store) DeleteJob(id uint) error {
	if id == 0 {
		return errors.New("缺少任务 id")
	}
	return db.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("job_id = ?", id).Delete(&models.CronJobRun{}).Error; err != nil {
			return err
		}
		return tx.Delete(&models.CronJob{}, id).Error
	})
}

// CreateRun 在开始执行前插入 running 状态记录,供前端拿到 run id 轮询。
func (s *Store) CreateRun(run *models.CronJobRun) error {
	if run == nil {
		return errors.New("run 为空")
	}
	return db.DB.Create(run).Error
}

// UpdateRun 由 runner 在结束时调用,把结果写回。
func (s *Store) UpdateRun(run *models.CronJobRun) error {
	if run == nil || run.ID == 0 {
		return errors.New("run 缺少 id")
	}
	return db.DB.Save(run).Error
}

// GetRun 读取一次执行的完整记录(含 stdout/stderr)。
func (s *Store) GetRun(id uint) (*models.CronJobRun, error) {
	var row models.CronJobRun
	if err := db.DB.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

// ListRuns 返回某任务的最近 N 次执行,默认按 started_at 倒序。
// limit=0 时使用 50 上限;offset 用于分页。
func (s *Store) ListRuns(jobID uint, limit, offset int) ([]models.CronJobRun, int64, error) {
	if jobID == 0 {
		return nil, 0, errors.New("缺少 job id")
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	if offset < 0 {
		offset = 0
	}
	var total int64
	if err := db.DB.Model(&models.CronJobRun{}).Where("job_id = ?", jobID).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []models.CronJobRun
	if err := db.DB.
		Where("job_id = ?", jobID).
		Order("started_at desc").
		Limit(limit).
		Offset(offset).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// DeleteRuns 清理某任务的所有历史记录(UI 删除任务前由 DeleteJob 隐式调用)。
func (s *Store) DeleteRuns(jobID uint) error {
	if jobID == 0 {
		return errors.New("缺少 job id")
	}
	return db.DB.Where("job_id = ?", jobID).Delete(&models.CronJobRun{}).Error
}

// UpdateJobRunSummary 把最近一次运行的时间与结果缓存到任务本身上,
// 避免 UI 每次都联表查询最近一次 cron_job_runs。
func (s *Store) UpdateJobRunSummary(jobID uint, lastRunAt time.Time, status string, nextRunAt time.Time) error {
	return db.DB.Model(&models.CronJob{}).Where("id = ?", jobID).Updates(map[string]any{
		"last_run_at": lastRunAt,
		"last_status": status,
		"next_run_at": nextRunAt,
	}).Error
}

// UpdateJobNextRun 仅更新下次执行时间,cron 表达式变化或重启时由 scheduler 调用。
func (s *Store) UpdateJobNextRun(jobID uint, nextRunAt time.Time) error {
	return db.DB.Model(&models.CronJob{}).Where("id = ?", jobID).Update("next_run_at", nextRunAt).Error
}

// UpdateJobActor 记录最后一次触发任务的用户名,便于审计。
func (s *Store) UpdateJobActor(jobID uint, actor string) error {
	if strings.TrimSpace(actor) == "" {
		return nil
	}
	return db.DB.Model(&models.CronJob{}).Where("id = ?", jobID).Update("updated_by", actor).Error
}

// IsDuplicateCronExpr 用于 cron 表达式层级的去重,避免同 cron 重复注册
// (在 robfig/cron 里同名同 schedule 会冲突,但同名同 schedule 加多 job 会 panic)。
func (s *Store) IsDuplicateCronExpr(expr string, exceptID uint) (bool, error) {
	if strings.TrimSpace(expr) == "" {
		return false, nil
	}
	q := db.DB.Model(&models.CronJob{}).Where("cron_expr = ?", expr)
	if exceptID > 0 {
		q = q.Where("id <> ?", exceptID)
	}
	var count int64
	if err := q.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// Ensure 触发 GORM 的 AutoMigrate,便于 store 单独被引用时也能保证表存在。
func (s *Store) Ensure() error {
	return db.DB.AutoMigrate(&models.CronJob{}, &models.CronJobRun{})
}