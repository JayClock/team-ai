# Gradle 构建配置说明

本文档说明了 Java 项目的 Gradle 构建配置。

## 项目结构

项目使用统一的 Gradle 配置，根目录包含所有 Java 模块的公共配置。

### 根目录配置文件

- `settings.gradle` - 定义所有 Java 模块
- `build.gradle` - 配置公共设置（group、version、repositories、依赖管理）
- `gradle.properties` - 构建优化参数

### 模块结构

```
team-ai/
├── settings.gradle              # 根目录配置文件
├── build.gradle                # 公共配置
├── gradle.properties           # 构建优化
├── libs/backend/
│   ├── api/                   # :backend:api
│   ├── domain/                # :backend:domain
│   ├── persistent/mybatis/     # :backend:persistent:mybatis
│   └── infrastructure/spring-ai/  # :backend:infrastructure:spring-ai
└── apps/
    └── server/                # :apps:server
```

## 常用命令

### 构建命令

#### 完整构建

```bash
gradle build
```

#### 跳过测试构建

```bash
gradle build -x test
```

#### 单个模块构建

```bash
# 构建所有后端模块
gradle :backend:api:build
gradle :backend:domain:build
gradle :backend:persistent:mybatis:build
gradle :backend:infrastructure:spring-ai:build

# 构建服务器应用
gradle :apps:server:build
```

### 测试命令

#### 运行所有测试

```bash
gradle test
```

#### 运行特定模块测试

```bash
gradle :backend:domain:test
gradle :backend:api:test
```

### 依赖管理

#### 查看依赖树

```bash
# 查看根项目依赖
gradle dependencies

# 查看特定模块依赖
gradle :backend:domain:dependencies
gradle :backend:api:dependencies
```

### 清理命令

#### 清理构建产物

```bash
gradle clean
```

#### 清理特定模块

```bash
gradle :backend:domain:clean
```

### 数据库迁移

#### 运行 Flyway 迁移

```bash
gradle :backend:persistent:mybatis:flywayMigrate
```

#### 查看迁移状态

```bash
gradle :backend:persistent:mybatis:flywayInfo
```

### 应用运行

#### 运行 Spring Boot 应用

```bash
gradle :apps:server:bootRun
```

## 构建优化

项目已启用以下 Gradle 性能优化（在 `gradle.properties` 中配置）：

- **构建缓存**：缓存构建输出，加速重复构建
- **配置缓存**：缓存配置阶段，加速构建启动
- **并行构建**：并行执行独立任务
- **按需配置**：只配置需要构建的项目

### 缓存效果

首次构建（无缓存）：约 8 秒
第二次构建（有缓存）：约 3 秒

## 模块依赖关系

```
:apps:server
  ├── :backend:domain
  ├── :backend:api
  ├── :backend:infrastructure:spring-ai
  └── :backend:persistent:mybatis
      ├── :backend:domain
      └── :backend:infrastructure:spring-ai

:backend:api
  └── :backend:domain

:backend:infrastructure:spring-ai
  └── :backend:domain
```

## 发布到本地仓库

所有模块都配置了 Maven 发布。要发布到本地 Maven 仓库：

```bash
# 发布所有模块
gradle publishToMavenLocal

# 发布特定模块
gradle :backend:api:publishToMavenLocal
gradle :backend:domain:publishToMavenLocal
```

## 故障排查

### 配置缓存问题

如果遇到配置缓存问题，可以禁用或清除缓存：

```bash
# 禁用配置缓存运行
gradle build --no-configuration-cache

# 清除配置缓存
gradle clean --configuration-cache
```

### 并行构建问题

如果遇到并行构建问题，可以禁用并行执行：

```bash
gradle build --no-parallel
```

### 依赖解析问题

查看详细的依赖解析信息：

```bash
gradle dependencies --configuration compileClasspath
```

## 版本管理

- Java：17
- Gradle：8.14.2
- Spring Boot：3.4.8
- Spring AI：1.0.1

依赖版本通过 Spring Boot BOM 统一管理，无需手动指定版本（特殊情况除外）。
