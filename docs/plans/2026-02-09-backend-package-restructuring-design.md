# Backend Package Restructuring Design

**Date:** 2026-02-09
**Domain:** business-driven-ai.com
**Status:** Approved

## Overview

Restructure backend Java packages from `reengineering.ddd.teamai` to `com.businessdrivenai` to align with the new domain name business-driven-ai.com.

## Current Package Structure

```
reengineering.ddd/
├── archtype/          # Generic architecture (Entity, HasMany, Many)
└── teamai/
    ├── model/         # Domain entities
    ├── description/   # Immutable description records
    ├── api/          # JAX-RS REST APIs
    └── mybatis/      # MyBatis persistence layer
```

## Target Package Structure

```
com.businessdrivenai/
├── archtype/         # Generic architecture interfaces
└── domain/
    ├── model/        # Domain entities (User, Account, Conversation, Message)
    └── description/  # Immutable description records
    ├── api/          # HATEOAS REST APIs
    └── persistence.mybatis/  # MyBatis persistence with caching
```

## Package Mapping

| Current Path                           | Target Path                                |
| -------------------------------------- | ------------------------------------------ |
| `reengineering.ddd.archtype`           | `com.businessdrivenai.archtype`            |
| `reengineering.ddd.teamai.model`       | `com.businessdrivenai.domain.model`        |
| `reengineering.ddd.teamai.description` | `com.businessdrivenai.domain.description`  |
| `reengineering.ddd.teamai.api`         | `com.businessdrivenai.api`                 |
| `reengineering.ddd.teamai.mybatis`     | `com.businessdrivenai.persistence.mybatis` |
| `reengineering.ddd.mybatis.*`          | `com.businessdrivenai.persistence.*`       |

## Module Mapping

| Module                        | New Package Root                        |
| ----------------------------- | --------------------------------------- |
| `libs/backend/domain`         | `com.businessdrivenai.domain.*`         |
| `libs/backend/api`            | `com.businessdrivenai.api.*`            |
| `libs/backend/persistent`     | `com.businessdrivenai.persistence.*`    |
| `libs/backend/infrastructure` | `com.businessdrivenai.infrastructure.*` |

## Implementation Strategy

### Phase 1: Package Refactoring (IDE Assisted)

1. Use IntelliJ IDEA "Refactor > Move"
2. Move packages in dependency order:
   - `reengineering.ddd.archtype` → `com.businessdrivenai.archtype`
   - `reengineering.ddd.teamai.model` → `com.businessdrivenai.domain.model`
   - `reengineering.ddd.teamai.description` → `com.businessdrivenai.domain.description`
   - `reengineering.ddd.teamai.api` → `com.businessdrivenai.api`
   - `reengineering.ddd.teamai.mybatis` → `com.businessdrivenai.persistence.mybatis`
   - `reengineering.ddd.mybatis.*` → `com.businessdrivenai.persistence.*`
3. IDE automatically updates all package declarations and import statements

### Phase 2: Configuration Updates

**Spring Boot Configuration (`apps/server/src/main/java/reengineering/ddd/Application.java`)**

```java
@SpringBootApplication(scanBasePackages = "com.businessdrivenai")
public class Application {
  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
```

**MyBatis Configuration (`apps/server/src/main/java/reengineering/ddd/config/MyBatis.java`)**

```java
@MapperScan("com.businessdrivenai.persistence.mybatis.mappers")
```

**Jersey Configuration (`apps/server/src/main/java/reengineering/ddd/config/Jersey.java`)**

```java
packages("com.businessdrivenai.api");
```

**Jackson Configuration (`apps/server/src/main/java/reengineering/ddd/config/HAL.java`)**

```java
// Update module registration if any package-specific configurations exist
```

### Phase 3: Verification

```bash
# Compile all Java modules
./gradlew clean compileJava

# Run all tests
./gradlew test

# Ensure TypeScript build unaffected
npx nx build
```

## Files to Update

### Configuration Files (Manual Updates)

- `apps/server/src/main/java/reengineering/ddd/Application.java`
- `apps/server/src/main/java/reengineering/ddd/config/MyBatis.java`
- `apps/server/src/main/java/reengineering/ddd/config/Jersey.java`
- `apps/server/src/main/java/reengineering/ddd/config/HAL.java`

### Java Files (IDE Refactoring)

- All `*.java` files (~100+ files)
  - Package declarations
  - Import statements

### MyBatis XML Files (Manual Updates)

- `libs/backend/persistent/mybatis/src/main/resources/mappers/**/*.xml`
  - Update `namespace` attributes

## Non-Requirements

- No changes to TypeScript packages (`packages/`)
- No changes to Gradle module structure (`libs/backend/*`)
- No changes to database schema
- No changes to API contracts (HATEOAS resources)

## Success Criteria

- ✅ All Java files compile without errors
- ✅ All tests pass
- ✅ Spring Boot application starts successfully
- ✅ No impact on TypeScript build
- ✅ Package names reflect business-driven-ai.com domain

## Estimated Effort

- Package refactoring: 30 minutes (IDE assisted)
- Configuration updates: 15 minutes
- Testing and verification: 30 minutes
- **Total: ~1.5 hours**
