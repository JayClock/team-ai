# PostgreSQL Database Setup

This document describes how to set up PostgreSQL for the Team AI application.

## Prerequisites

- PostgreSQL 12 or higher installed
- Access to create databases and users

## Development Setup

### 1. Install PostgreSQL

**macOS (using Homebrew):**

```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Windows:**
Download and install from https://www.postgresql.org/download/windows/

### 2. Create Database and User

Connect to PostgreSQL as superuser:

```bash
sudo -u postgres psql
```

Create database and user for development:

```sql
-- Create user
CREATE USER teamai_dev WITH PASSWORD 'teamai_dev';

-- Create database
CREATE DATABASE teamai_dev OWNER teamai_dev;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE teamai_dev TO teamai_dev;

-- Exit
\q
```

### 3. Environment Variables

Set the following environment variables for development:

```bash
export DB_USERNAME=teamai_dev
export DB_PASSWORD=teamai_dev
```

Or create a `.env` file in the project root:

```
DB_USERNAME=teamai_dev
DB_PASSWORD=teamai_dev
```

## Production Setup

### 1. Create Production Database

```sql
-- Create user with strong password
CREATE USER teamai WITH PASSWORD 'your_strong_password_here';

-- Create database
CREATE DATABASE teamai OWNER teamai;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE teamai TO teamai;
```

### 2. Environment Variables

Set the following environment variables:

```bash
export DB_HOST=your_db_host
export DB_PORT=5432
export DB_NAME=teamai
export DB_USERNAME=teamai
export DB_PASSWORD=your_strong_password_here
```

## Testing

The application uses H2 database for testing with PostgreSQL compatibility mode. No additional setup is required for running tests.

## Connection Verification

Test the connection:

```bash
psql -h localhost -U teamai_dev -d teamai_dev
```

## Migration

The application uses Flyway for database migrations. Migrations will run automatically on application startup.

To manually run migrations:

```bash
gradle :backend:persistent:mybatis:flywayMigrate
```

## Quick Setup with Docker

1. Start PostgreSQL:

```bash
docker-compose up -d postgres
```

2. Run migrations:

```bash
gradle :backend:persistent:mybatis:flywayMigrate
```

3. Start application:

```bash
gradle :apps:server:bootRun
```

2. Run migrations:

```bash
./gradlew :libs:backend:persistent:mybatis:flywayMigrate
```

3. Start the application:

```bash
./gradlew :apps:team-ai-server:bootRun
```

## Troubleshooting

### Connection Issues

1. Check if PostgreSQL is running:

   ```bash
   sudo systemctl status postgresql
   ```

2. Check PostgreSQL configuration:

   ```bash
   sudo -u postgres psql -c "SHOW config_file;"
   ```

3. Verify user permissions:
   ```sql
   \du teamai_dev
   ```

### Performance Tuning

For production, consider adjusting these PostgreSQL settings in `postgresql.conf`:

```
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
```

Restart PostgreSQL after making changes:

```bash
sudo systemctl restart postgresql
```
