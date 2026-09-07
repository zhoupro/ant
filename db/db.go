package db

import (
	"errors"
	"log"
	"os"
	"path/filepath"

	"mc/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Init(dbPath string) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		log.Fatalf("failed to create db dir: %v", err)
	}

	var err error
	DB, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}

	if err := DB.AutoMigrate(
		&models.AdminUser{},
		&models.RegularUser{},
		&models.Role{},
		&models.Permission{},
		&models.RolePermission{},
		&models.AdminUserRole{},
		&models.RegularUserRole{},
		&models.Session{},
		&models.Attachment{},
		&models.Setting{},
		&models.APIToken{},
	); err != nil {
		log.Fatalf("failed to migrate: %v", err)
	}

	if err := migrateLegacyUsers(); err != nil {
		log.Printf("warning: legacy user migration: %v", err)
	}

	seedPermissions()
	seedRoles()

	if err := seedDefaultAdmin(); err != nil {
		log.Printf("warning: seed default admin: %v", err)
	}

	log.Printf("db ready at %s", dbPath)
}

func SetDefault(key, value string) {
	var s models.Setting
	if err := DB.First(&s, "key = ?", key).Error; err != nil {
		if err := DB.Create(&models.Setting{Key: key, Value: value}).Error; err != nil {
			log.Printf("failed to seed default setting %s: %v", key, err)
		}
		return
	}
	if s.Value == "" {
		DB.Model(&s).Update("value", value)
	}
}

// migrateLegacyUsers 把旧 users 表的「test」账号搬到 admin_users,然后清理旧表与会话。
// 旧 sessions 引用的 user_id 不再有意义,直接清空,要求用户重新登录。
func migrateLegacyUsers() error {
	if !DB.Migrator().HasTable("users") {
		return nil
	}
	type legacyUser struct {
		ID                 uint
		Username           string
		PasswordHash       string
		MustChangePassword bool
	}
	var legacy []legacyUser
	if err := DB.Raw("SELECT id, username, password_hash, must_change_password FROM users").Scan(&legacy).Error; err != nil {
		return err
	}
	if len(legacy) == 0 {
		// Empty users table; drop it and move on.
		return DB.Migrator().DropTable("users")
	}

	if err := DB.Where("1 = 1").Delete(&models.Session{}).Error; err != nil {
		return err
	}

	for _, u := range legacy {
		var existing models.AdminUser
		err := DB.Where("username = ?", u.Username).First(&existing).Error
		if err == nil {
			continue
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		newAdmin := models.AdminUser{
			Username:           u.Username,
			PasswordHash:       u.PasswordHash,
			MustChangePassword: u.MustChangePassword,
		}
		if err := DB.Create(&newAdmin).Error; err != nil {
			return err
		}
	}
	if err := DB.Migrator().DropTable("users"); err != nil {
		return err
	}
	log.Printf("migrated %d legacy users to admin_users", len(legacy))
	return nil
}

func seedPermissions() {
	for _, p := range models.AllPermissions {
		var existing models.Permission
		err := DB.Where("code = ?", p.Code).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if err := DB.Create(&models.Permission{
				Code:        p.Code,
				Name:        p.Name,
				Description: p.Description,
				Category:    p.Category,
			}).Error; err != nil {
				log.Printf("failed to seed permission %s: %v", p.Code, err)
			}
			continue
		}
		if err != nil {
			log.Printf("query permission %s: %v", p.Code, err)
			continue
		}
		// Keep name/description/category up-to-date so renamed or re-categorised
		// built-ins reflect without forcing a manual migration.
		if existing.Name != p.Name || existing.Description != p.Description || existing.Category != p.Category {
			DB.Model(&existing).Updates(map[string]any{
				"name":        p.Name,
				"description": p.Description,
				"category":    p.Category,
			})
		}
	}
}

// seedRoles 在所有权限就绪后,确保两个内置角色存在并绑定了正确权限。
func seedRoles() {
	ensureRole(models.RoleCodeSuperAdmin, "超级管理员", "拥有全部权限,可管理用户与角色", allPermissionIDs)
	// 默认普通用户只挂"查看首页" + "查看页面配置",这样底部导航仍可工作,
	// 但任何数据/管理功能都需要管理员显式授权。
	ensureRole(models.RoleCodeRegularUser, "普通用户", "默认仅可访问首页,可被管理员分配其他功能", func() []uint {
		return []uint{
			permIDByCode(models.PermViewHome),
			permIDByCode(models.PermViewPages),
		}
	})
}

func ensureRole(code, name, description string, permIDsFn func() []uint) {
	var role models.Role
	err := DB.Where("code = ?", code).First(&role).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		role = models.Role{
			Code:        code,
			Name:        name,
			Description: description,
			IsSystem:    true,
		}
		if err := DB.Create(&role).Error; err != nil {
			log.Printf("failed to seed role %s: %v", code, err)
			return
		}
	} else if err != nil {
		log.Printf("query role %s: %v", code, err)
		return
	} else {
		// Refresh name/description so renamed built-ins show up.
		if role.Name != name || role.Description != description || !role.IsSystem {
			DB.Model(&role).Updates(map[string]any{
				"name":        name,
				"description": description,
				"is_system":   true,
			})
		}
	}
	// Sync permissions for built-in roles only.
	if !role.IsSystem {
		return
	}
	permIDs := permIDsFn()
	var existingIDs []uint
	DB.Model(&models.RolePermission{}).
		Where("role_id = ?", role.ID).
		Pluck("permission_id", &existingIDs)
	if equalUintSet(existingIDs, permIDs) {
		return
	}
	if err := DB.Where("role_id = ?", role.ID).Delete(&models.RolePermission{}).Error; err != nil {
		log.Printf("clear role_permissions for %s: %v", code, err)
		return
	}
	for _, pid := range permIDs {
		if err := DB.Create(&models.RolePermission{RoleID: role.ID, PermissionID: pid}).Error; err != nil {
			log.Printf("attach permission %d to role %s: %v", pid, code, err)
		}
	}
}

func seedDefaultAdmin() error {
	var count int64
	if err := DB.Model(&models.AdminUser{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("test123"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	admin := models.AdminUser{
		Username:           "test",
		PasswordHash:       string(hash),
		MustChangePassword: true,
	}
	if err := DB.Create(&admin).Error; err != nil {
		return err
	}
	superRole, err := roleByCode(models.RoleCodeSuperAdmin)
	if err != nil {
		return err
	}
	if err := DB.Create(&models.AdminUserRole{AdminUserID: admin.ID, RoleID: superRole.ID}).Error; err != nil {
		return err
	}
	log.Printf("seeded default admin 'test' with role %s (must change password on first login)", models.RoleCodeSuperAdmin)
	return nil
}

func allPermissionIDs() []uint {
	var ids []uint
	if err := DB.Model(&models.Permission{}).Pluck("id", &ids).Error; err != nil {
		log.Printf("list permission ids: %v", err)
		return nil
	}
	return ids
}

func permIDByCode(code models.PermissionCode) uint {
	var id uint
	if err := DB.Model(&models.Permission{}).Where("code = ?", code).Pluck("id", &id).Error; err != nil {
		log.Printf("lookup permission %s: %v", code, err)
		return 0
	}
	return id
}

func roleByCode(code string) (*models.Role, error) {
	var role models.Role
	if err := DB.Where("code = ?", code).First(&role).Error; err != nil {
		return nil, err
	}
	return &role, nil
}

func equalUintSet(a, b []uint) bool {
	if len(a) != len(b) {
		return false
	}
	seen := make(map[uint]struct{}, len(a))
	for _, v := range a {
		seen[v] = struct{}{}
	}
	for _, v := range b {
		if _, ok := seen[v]; !ok {
			return false
		}
	}
	return true
}

// ResetDefaultAdmin 重置第一个内置管理员账号的密码并强制下次登录修改。
// CLI 参数 -reset-default-user 调用,保留以便运维。如果找不到任何管理员,
// 则把当前密码视为新建超级管理员 'test' 的种子,需要手动初始化 app.db。
func ResetDefaultAdmin(password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	var admin models.AdminUser
	if err := DB.Order("id asc").First(&admin).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("系统中没有任何管理员账号,请先正常启动一次再重置")
		}
		return err
	}
	admin.PasswordHash = string(hash)
	admin.MustChangePassword = true
	if err := DB.Save(&admin).Error; err != nil {
		return err
	}
	if err := DB.Where("1 = 1").Delete(&models.Session{}).Error; err != nil {
		return err
	}
	return nil
}
