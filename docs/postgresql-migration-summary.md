# PostgreSQL Migration Summary

This document summarizes the changes made to migrate the Team AI project from H2 to PostgreSQL.

## Changes Made

### 1. Dependencies Updated

**Files Modified:**
- `apps/team-ai-server/build.gradle`
- `libs/backend/persistent/mybatis/build.gradle`

**Changes:**
- Replaced `com.h2database:h2` with `org.postgresql:postgresql` in production dependencies
- Added `org.flywaydb:flyway-database-postgresql` for PostgreSQL-specific Flyway support
- Kept H2 as test dependency for testing

### 2. Configuration Files Updated

**Files Modified:**
- `apps/team-ai-server/src/main/resources/application.yml`
- `libs/backend/persistent/mybatis/src/test/resources/application.yml`

**Files Created:**
- `apps/team-ai-server/src/main/resources/application-dev.yml`
- `apps/team-ai-server/src/main/resources/application-prod.yml`

**Changes:**
- Updated main configuration to use PostgreSQL driver and connection settings
- Added environment variable support for database credentials
- Added HikariCP connection pool configuration
- Updated test configuration to use H2 with PostgreSQL compatibility mode
- Created environment-specific configurations for dev and prod

### 3. Database Schema Migration

**Files Modified:**
- `libs/backend/persistent/mybatis/src/main/resources/db.migration/V01__create_users.sql`
- `libs/backend/persistent/mybatis/src/main/resources/db.migration/V02__create_accounts.sql`

**Changes:**
- Replaced MySQL-style backticks with standard SQL identifiers
- Changed `AUTO_INCREMENT` to `BIGSERIAL` for PostgreSQL
- Updated `user_id` column type from `VARCHAR(255)` to `BIGINT` for proper foreign key relationship
- Removed MySQL-specific syntax

### 4. MyBatis Mappers Updated

**Files Modified:**
- `libs/backend/persistent/mybatis/src/main/resources/mybatis.mappers/UsersMapper.xml`
- `libs/backend/persistent/mybatis/src/main/resources/mybatis.mappers/AccountsMapper.xml`

**Changes:**
- Updated SQL queries to use lowercase table and column names (PostgreSQL convention)
- Changed JDBC type from `VARCHAR` to `BIGINT` for account ID mapping
- Ensured all SQL is PostgreSQL-compatible

### 5. Development Environment Setup

**Files Created:**
- `docker-compose.yml` - PostgreSQL and pgAdmin containers for development
- `scripts/init-db.sql` - Database initialization script
- `scripts/migrate-to-postgresql.sh` - Migration automation script
- `.env.example` - Environment variables template

**Files Modified:**
- `.gitignore` - Added environment variable files to ignore list

### 6. Documentation

**Files Created:**
- `docs/database-setup.md` - Comprehensive PostgreSQL setup guide
- `docs/postgresql-migration-summary.md` - This summary document

**Files Modified:**
- `README.md` - Updated with PostgreSQL information and setup instructions

## Database Schema Changes

### Before (H2/MySQL)
```sql
CREATE TABLE `users` (
    `id` BIGINT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    `name` VARCHAR(255),
    `email` VARCHAR(255) UNIQUE
);

CREATE TABLE `accounts` (
    `id` BIGINT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    `provider` VARCHAR(50) NOT NULL,
    `provider_id` VARCHAR(255) NOT NULL,
    `user_id` VARCHAR(255),
    FOREIGN KEY (`user_id`) REFERENCES USERS (ID)
);
```

### After (PostgreSQL)
```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE
);

CREATE TABLE accounts (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    provider_id VARCHAR(255) NOT NULL,
    user_id BIGINT,
    FOREIGN KEY (user_id) REFERENCES users (id)
);
```

## Environment Variables

The application now supports the following environment variables:

- `DB_HOST` - Database host (default: localhost)
- `DB_PORT` - Database port (default: 5432)
- `DB_NAME` - Database name (default: teamai)
- `DB_USERNAME` - Database username (default: teamai)
- `DB_PASSWORD` - Database password (default: teamai)
- `SPRING_PROFILES_ACTIVE` - Spring profile (dev, prod)

## Migration Steps

1. **Install PostgreSQL** (or use Docker)
2. **Create database and user**
3. **Set environment variables**
4. **Run the migration script**: `./scripts/migrate-to-postgresql.sh`
5. **Start the application**

## Testing

- Tests continue to use H2 database with PostgreSQL compatibility mode
- All existing tests should pass without modification
- Run tests with: `./gradlew test`

## Rollback Plan

If rollback is needed:
1. Revert the dependency changes in `build.gradle` files
2. Restore original `application.yml` configurations
3. Revert SQL migration files to original MySQL syntax
4. Revert MyBatis mapper changes

## Benefits of PostgreSQL Migration

1. **Production-ready**: PostgreSQL is more suitable for production environments
2. **Better performance**: Superior performance for complex queries and large datasets
3. **ACID compliance**: Full ACID compliance for data integrity
4. **Advanced features**: Support for JSON, arrays, and advanced indexing
5. **Scalability**: Better horizontal and vertical scaling options
6. **Community support**: Large community and extensive documentation

## Next Steps

1. Set up PostgreSQL in production environment
2. Configure backup and monitoring
3. Optimize PostgreSQL settings for production workload
4. Consider implementing connection pooling optimizations
5. Set up database monitoring and alerting
