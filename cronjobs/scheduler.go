package cronjobs

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"mc/models"

	"github.com/robfig/cron/v3"
)

// Scheduler 把 robfig/cron 的 *cron.Cron 包成一个对业务更友好的句柄:
// 内部用 jobID 维护 <-> cron.EntryID 的映射,Add/Remove/Update 只关心任务定义,
// 触发交给 Runner,日志通过回调通知 UI。
type Scheduler struct {
	parser cron.Parser

	store  *Store
	runner *Runner

	mu          sync.Mutex
	cron        *cron.Cron
	entries     map[uint]cron.EntryID // jobID -> cron entry
	jobByCron   map[cron.EntryID]uint
	location    *time.Location
	triggerHook TriggerHook
}

// TriggerHook 是 scheduler 在每次触发时对外的通知,handler 层可借此
// 推送 WebSocket / SSE,或在日志中追加事件。当前默认 noop。
type TriggerHook func(job *models.CronJob, runID uint, trigger string)

// NewScheduler 构造一个尚未启动的调度器。location 留空则用本地时区。
func NewScheduler(store *Store, runner *Runner, location *time.Location) *Scheduler {
	if store == nil {
		store = NewStore()
	}
	if runner == nil {
		// 没有 runner 时构造一个临时无日志目录的 runner,主要用于 bootstrap。
		// 实际项目中 main.go 应注入真实 runner。
		r, _ := NewRunner("")
		runner = r
	}
	if location == nil {
		location = time.Local
	}
	return &Scheduler{
		parser: cron.NewParser(
			cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor,
		),
		store:     store,
		runner:    runner,
		entries:   map[uint]cron.EntryID{},
		jobByCron: map[cron.EntryID]uint{},
		location:  location,
	}
}

// SetTriggerHook 注册一个全局事件回调。
func (s *Scheduler) SetTriggerHook(h TriggerHook) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.triggerHook = h
}

// Start 启动 cron 循环并把所有当前 Enabled=true 的任务载入。
// 多次调用安全,但只有第一次会真正启动 cron 循环。
func (s *Scheduler) Start(ctx context.Context) error {
	s.mu.Lock()
	if s.cron != nil {
		s.mu.Unlock()
		return nil
	}
	c := cron.New(cron.WithParser(s.parser), cron.WithLocation(s.location))
	s.cron = c
	s.mu.Unlock()

	jobs, err := s.store.ListEnabledJobs()
	if err != nil {
		return fmt.Errorf("载入定时任务失败: %w", err)
	}
	for i := range jobs {
		if err := s.Add(&jobs[i]); err != nil {
			log.Printf("cron: 任务 %d 加入失败: %v", jobs[i].ID, err)
		}
	}

	c.Start()
	go func() {
		<-ctx.Done()
		s.Stop()
	}()
	return nil
}

// Stop 停止 cron 循环,但不取消正在执行的 shell 进程 — 后台命令应继续跑完。
func (s *Scheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cron == nil {
		return
	}
	ctx := s.cron.Stop()
	<-ctx.Done()
	s.cron = nil
	s.entries = map[uint]cron.EntryID{}
	s.jobByCron = map[cron.EntryID]uint{}
}

// Add / Remove / Update —— 这些方法在 scheduler 启动后也可调用,
// 内部会用 entry id 维护映射,因此可以热更新。
func (s *Scheduler) Add(job *models.CronJob) error {
	if job == nil {
		return errors.New("job 为空")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.addLocked(job)
}

func (s *Scheduler) Remove(jobID uint) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.removeLocked(jobID)
}

// Update 会先用最新字段替换 entry,然后立即重新计算 NextRunAt。
func (s *Scheduler) Update(job *models.CronJob) error {
	if job == nil {
		return errors.New("job 为空")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.removeLocked(job.ID)
	if !job.Enabled {
		// 关闭后清空 next_run_at,UI 上就能立刻看出"未启用"。
		_ = s.store.UpdateJobNextRun(job.ID, time.Time{})
		return nil
	}
	return s.addLocked(job)
}

// NextRun 返回某任务下次触发时间,若未启用或不存在返回 zero time。
func (s *Scheduler) NextRun(jobID uint) time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cron == nil {
		return time.Time{}
	}
	if id, ok := s.entries[jobID]; ok {
		return s.cron.Entry(id).Next
	}
	return time.Time{}
}

// TriggerNow 是 manual run 的入口,绕过 cron schedule 直接调用 runner。
func (s *Scheduler) TriggerNow(job *models.CronJob, actor string) (uint, error) {
	if job == nil {
		return 0, errors.New("job 为空")
	}
	return s.runner.Run(job, s.store, models.CronTriggerManual, actor)
}

// addLocked / removeLocked —— 内部使用,调用方必须持有 s.mu。
func (s *Scheduler) addLocked(job *models.CronJob) error {
	if s.cron == nil {
		// 还未 Start —— 把加载推迟到 Start 里。
		return nil
	}
	if !job.Enabled {
		return nil
	}
	schedule, err := s.parser.Parse(job.CronExpr)
	if err != nil {
		return fmt.Errorf("cron 表达式无效: %w", err)
	}
	entryID, err := s.cron.AddFunc(job.CronExpr, s.makeFunc(job))
	if err != nil {
		return err
	}
	s.entries[job.ID] = entryID
	s.jobByCron[entryID] = job.ID
	// NextRunAt 同步落库,UI 可立即看到下次执行时间。
	_ = s.store.UpdateJobNextRun(job.ID, schedule.Next(time.Now()))
	return nil
}

func (s *Scheduler) removeLocked(jobID uint) {
	if s.cron == nil {
		return
	}
	if id, ok := s.entries[jobID]; ok {
		s.cron.Remove(id)
		delete(s.entries, jobID)
		delete(s.jobByCron, id)
	}
}

func (s *Scheduler) makeFunc(job *models.CronJob) func() {
	return func() {
		// 每次触发时重新读一次最新任务定义,避免长时间运行的 cron 仍跑旧命令。
		fresh, err := s.store.GetJob(job.ID)
		if err != nil {
			log.Printf("cron: 触发任务 %d 时读取最新定义失败: %v", job.ID, err)
			return
		}
		if !fresh.Enabled {
			s.Remove(fresh.ID)
			_ = s.store.UpdateJobNextRun(fresh.ID, time.Time{})
			return
		}
		runID, err := s.runner.Run(fresh, s.store, models.CronTriggerSchedule, "system")
		if err != nil {
			log.Printf("cron: 触发任务 %d 失败: %v", fresh.ID, err)
			return
		}
		s.mu.Lock()
		hook := s.triggerHook
		s.mu.Unlock()
		if hook != nil {
			hook(fresh, runID, models.CronTriggerSchedule)
		}
	}
}