# Team AI - Smart Domain DDD & HATEOAS Code Sample

[![Nx](https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png)](https://nx.dev)

**Team AI** is a code sample project demonstrating **Domain-Driven Design (DDD)** and **HATEOAS** implementation using the **Smart Domain** pattern. This project showcases how to drive business logic and RESTful HATEOAS interfaces directly through highly cohesive domain models, solving performance bottlenecks and logic fragmentation issues in traditional architectures.

## Recommended Reading Order

To better understand this project, we recommend reading the documentation in the following order:

1. [Smart Domain DDD Architecture Design](libs/backend/README.md) - Complete architecture design documentation to understand core design concepts
2. [REST Principles and Agentic UI](public/REST_Principles_Agentic_UI.pdf) - Detailed explanation of REST architecture principles and Agentic UI design
3. [HATEOAS Client Implementation](packages/resource/README.md) - TypeScript/JavaScript client library documentation

## Architecture Overview

### Smart Domain DDD Implementation

This project abandons the traditional "Anemic Model + Service Script" architecture, adopting the **Smart Domain** pattern to implement true Domain-Driven Design.

#### Core Features

- **Association Object Pattern**: Solves the most challenging conflict between performance and model purity in DDD
- **Wide-Narrow Interface Separation**: Ensures business logic encapsulation and safe, controlled state changes
- **Collective Logic Encapsulation**: Achieves high-performance business logic processing through intention-revealing interface design
- **HATEOAS RESTful API**: Implements Richardson Maturity Model Level 3 progressive disclosure mechanism

#### Domain Model Examples

- **User**: Aggregate root, system entry point and identity
- **Account**: User's configuration and account information (e.g., API Key management)
- **Conversation**: Conversation context initiated by user, serving as business logic carrier
- **Message**: Specific interaction records within conversations

### HATEOAS Client Library (@hateoas-ts/resource)

`@hateoas-ts/resource` is a TypeScript/JavaScript client library implementation demonstrating how to interact with REST APIs following the HAL (Hypertext Application Language) specification.

#### Core Features

- **Type Safety**: TypeScript types ensure correctness when accessing data and relationships
- **Declarative Navigation**: Use semantic relationship names for navigation instead of hardcoded URLs
- **Fluent API**: Chained calls make code more readable and expressive
- **Flexible Caching**: Multiple caching strategies adapt to different application scenarios
- **Event-Driven**: Respond to resource state changes through event listening

### Desktop Runtime Architecture

For desktop-first ACP orchestration, the runtime is split into two Node services with different responsibilities:

- **`apps/local-server`**: Desktop-facing local API server. It owns local persistence, project/session/task resources, desktop authentication/CORS, and the HATEOAS routes consumed by the Electron shell.
- **`apps/agent-gateway`**: Provider execution sidecar. It owns ACP/MCP/A2A protocol adaptation, provider catalog/install authority, provider availability checks, prompt execution, cancellation, event streaming, and runtime metrics.

#### Responsibility Boundary

- `local-server` is the control plane for desktop mode.
  - Stores sessions, tasks, notes, and project state in the local data directory.
  - Exposes `/api/...` resources for the desktop UI.
  - Delegates ACP provider catalog and install operations to `agent-gateway`.
- `agent-gateway` is the execution plane for agent providers.
  - Resolves which providers exist and whether they are runnable.
  - Manages provider installation metadata and registry-backed discovery.
  - Launches provider adapters such as Codex and ACP CLI agents.
  - Streams normalized runtime events back to `local-server`.

#### ACP Flow

```text
Electron desktop UI
  -> local-server (/api resources, persistence, orchestration state)
  -> agent-gateway (provider authority, protocol/runtime execution)
  -> ACP provider / CLI adapter
```

#### Current Provider Authority

After the provider runtime refactor:

- `agent-gateway` is the single source of truth for ACP provider catalog and install operations.
- `local-server` caches provider availability from `agent-gateway` for local runtime checks.
- `local-server` still retains a minimal local ACP command resolver only for local runtime fallback paths; it no longer owns provider catalog or install management.

## Quick Start

### Requirements

- Node.js 18+
- Java 17+
- PostgreSQL 14+ (optional, for persistence layer examples)

### Install Dependencies

```bash
# Install all dependencies
npm install

# Or use pnpm
pnpm install
```

### Run Examples

```bash
# Start development environment
npx nx dev team-ai

# Build project
npx nx build team-ai

# Run tests
npx nx test
```

### Docker Deployment

The project supports containerized deployment using Docker, with Dockerfiles configured for both frontend and backend.

#### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Docker Network                         │
│                  (teamai-network)                        │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │     web     │───▶│   server    │───▶│  postgres   │  │
│  │   (Nginx)   │    │ (Spring Boot)│    │ (PostgreSQL)│  │
│  │    :80      │    │    :8080    │    │    :5432    │  │
│  └─────────────┘    └─────────────┘    └─────────────┘  │
└─────────────────────────────────────────────────────────┘
```

#### Using Docker Compose

```bash
# Start database only (local development)
docker compose up postgres -d

# Build Nx artifacts first (required)
npx nx run-many -t build --projects=:apps:server,@web/main

# Build Docker images from Nx artifacts
npx nx run-many -t docker:build --projects=:apps:server,@web/main

# Start full service stack (postgres + server + web)
docker compose --profile full up -d

# Check service status
docker compose ps

# View logs
docker compose logs -f server
docker compose logs -f web

# Stop all services
docker compose down

# Stop and clean up data volumes
docker compose down -v
```

#### Build Docker Images with Nx

The `@nx/docker` plugin is configured with per-project `docker:build`/`docker:run` targets:

```bash
# Build backend image
npx nx build :apps:server
npx nx run :apps:server:docker:build

# Build frontend image
npx nx build @web/main
npx nx run @web/main:docker:build

# Run backend container
npx nx run :apps:server:docker:run

# Run frontend container
npx nx run @web/main:docker:run
```

#### Environment Variables Configuration

Before deployment, ensure necessary environment variables are configured. Refer to `.env.example`:

```bash
# Copy environment variable template
cp .env.example .env

# Edit configuration
vim .env
```

Main configuration items:

- `DB_*` - Database connection configuration
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` - GitHub OAuth2 authentication

#### Automated Production Deployment (GitHub Actions + SSH)

This repository includes an automated deploy workflow:

- Workflow file: `.github/workflows/deploy.yml`
- Trigger: push to `main` (or manual `workflow_dispatch`)
- Flow: build Nx artifacts -> build and push Docker images to GHCR -> SSH deploy with Docker Compose

Required GitHub repository secrets:

- `GHCR_USERNAME` - GitHub username used for GHCR login
- `GHCR_TOKEN` - PAT with `read:packages` and `write:packages`
- `DEPLOY_HOST` - Production server host/IP
- `DEPLOY_USER` - SSH user
- `DEPLOY_SSH_KEY` - Private SSH key
- `DEPLOY_PORT` - Optional SSH port (defaults to `22`)
- `DEPLOY_PATH` - Optional deployment directory on server (defaults to `/opt/team-ai`)

One-time server setup:

1. Install Docker + Docker Compose plugin.
2. Create deployment directory (e.g. `/opt/team-ai`).
3. Create `/opt/team-ai/.env` from `.env.production.example` and fill all secrets.
4. Ensure the server user can run Docker commands.

At deployment time, workflow updates these `.env` keys automatically:

- `VERSION`
- `SERVER_IMAGE`
- `WEB_IMAGE`

### Database Setup (Optional)

If you need to run persistence layer examples, please refer to [Database Setup Documentation](docs/database-setup.md)

## Documentation Navigation

### Core Technical Documentation

- [Smart Domain DDD Architecture Design](libs/backend/README.md) - Complete architecture design documentation
  - Smart Domain pattern explained
  - Association Object design
  - Wide-Narrow interface separation strategy
  - HATEOAS RESTful API design

- [HATEOAS Client Implementation](packages/resource/README.md) - TypeScript/JavaScript client library documentation
  - Basic usage and API reference
  - Advanced usage and best practices
  - Middleware and caching strategies
  - Error handling and event listening

### Supplementary Documentation

- [Desktop Local-First Status](docs/desktop-local-first-status.md) - Current Electron + local Node server delivery status, implemented routes, and remaining gaps
- [Desktop-First Multi-Agent Platform Blueprint](docs/desktop-first-multi-agent-platform-blueprint.md) - Refactor plan for turning the current desktop mode into the primary local multi-agent product
- [Database Setup](docs/database-setup.md) - PostgreSQL configuration and migration guide
- [PostgreSQL Migration Summary](docs/postgresql-migration-summary.md) - Detailed database migration records
- [MCP Tools Guide](docs/mcp-tools.md) - MCP tool list, step controls, and idempotency rules
- [A2A Gateway Guide](docs/a2a-gateway.md) - ACP envelope contract, forwarding flow, and protocol errors
- [Orchestration Observability Guide](docs/orchestration-observability.md) - E2E gate suite, telemetry metrics, trace flow, and alert thresholds

## Development Guide

### Project Structure

```
team-ai/
├── apps/                    # Example applications
│   ├── server/             # Backend server example (Java Spring Boot)
│   ├── desktop/            # Electron desktop shell
│   ├── local-server/       # Desktop control plane: local API, persistence, orchestration state
│   ├── agent-gateway/      # Desktop execution sidecar: provider authority, protocol/runtime gateway
│   └── web/                # Frontend application example (React)
├── libs/                   # Backend core libraries
│   └── backend/            # Smart Domain DDD implementation
│       ├── api/            # HATEOAS API layer
│       ├── domain/         # Domain model and business logic
│       └── persistent/     # Persistence layer examples
├── packages/               # Frontend packages
│   └── resource/           # HATEOAS client library implementation
└── docs/                   # Technical documentation
```

### Available Commands

```bash
# View all available projects
npx nx show projects

# View available targets for a specific project
npx nx show project team-ai

# View project dependency graph
npx nx graph
```

### Code Generation

Use Nx plugins to generate new code:

```bash
# Generate new application
npx nx g @nx/next:app demo

# Generate new library
npx nx g @nx/react:lib mylib
```

## Architecture Design Principles

### Smart Domain DDD Core Concepts

1. **Bridging Performance and Model Barriers**: Solve N+1 problems through Association Objects
2. **Protecting Business Logic Encapsulation**: Wide-Narrow interface separation ensures safe, controlled state changes
3. **Intention-Revealing Interfaces**: Express business intent through semantic method names
4. **Low-Cost HATEOAS**: Isomorphic mapping implements progressive disclosure mechanism

### HATEOAS Client Design Principles

1. **Type Safety First**: Ensure compile-time error checking
2. **Declarative Interaction**: Navigate resources through semantic relationships
3. **Performance Optimization**: Smart caching and request deduplication
4. **Event-Driven**: Reactive state management

## Contributing

We welcome community contributions! Please follow these steps:

1. Fork the project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details

## Useful Links

### Learning Resources

- [Nx Official Documentation](https://nx.dev)
- [Smart Domain Architecture Explained](libs/backend/README.md)
- [HATEOAS Client Library Documentation](packages/resource/README.md)

### Community

- [Nx Discord](https://go.nx.dev/community)
- [Nx Twitter](https://twitter.com/nxdevtools)
- [Nx LinkedIn](https://www.linkedin.com/company/nrwl)
- [Nx YouTube Channel](https://www.youtube.com/@nxdevtools)

---

**Team AI** - A code sample project implementing DDD & HATEOAS with Smart Domain.
