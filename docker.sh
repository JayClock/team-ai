#!/bin/bash
# =============================================================================
# Team AI Docker Management Script (Nx Standard)
# =============================================================================
# Workflow:
#   1) Build artifacts with Nx
#   2) Build Docker images from Nx artifacts
#   3) Run stack with Docker Compose
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

VERSION=${VERSION:-latest}
REGISTRY=${REGISTRY:-}
NX_SERVER_PROJECT=":apps:server"
NX_WEB_PROJECT="@web/main"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

build_artifacts() {
    log_info "Building Nx artifacts (${NX_SERVER_PROJECT}, ${NX_WEB_PROJECT})..."
    npx nx run-many -t build --projects="${NX_SERVER_PROJECT},${NX_WEB_PROJECT}" --parallel=2
    log_info "Nx artifacts built successfully."
}

build_images() {
    log_info "Building Docker images via Nx docker targets..."
    npx nx run-many -t docker:build --projects="${NX_SERVER_PROJECT},${NX_WEB_PROJECT}" --parallel=2

    log_info "Docker images built and tagged:"
    docker images | grep -E "teamai/server|teamai/web" || true
}

build() {
    build_artifacts
    build_images
}

build_compose() {
    log_info "Building Docker images with docker compose (requires Nx artifacts first)..."
    build_artifacts
    docker compose build --parallel
    log_info "docker compose build complete."
}

up() {
    log_info "Starting full Team AI stack..."
    docker compose --profile full up -d
    log_info "Services started."
    log_info "Frontend: http://localhost"
    log_info "Backend:  http://localhost:8080"
    docker compose ps
}

up_prod() {
    log_info "Starting Team AI in production mode..."
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    log_info "Production services started."
}

down() {
    log_info "Stopping all services..."
    docker compose --profile full down
    log_info "Services stopped."
}

dev() {
    log_info "Starting PostgreSQL for local development..."
    docker compose up -d postgres
    log_info "PostgreSQL is running on port 5432"
    log_info "Connection string: postgresql://teamai_dev:teamai_dev@localhost:5432/teamai_dev"
}

logs() {
    docker compose --profile full logs -f "$@"
}

clean() {
    log_warn "This will remove all containers, volumes, and local images!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Stopping and removing containers..."
        docker compose --profile full down -v --rmi local

        log_info "Removing dangling images..."
        docker image prune -f

        log_info "Cleanup complete!"
    fi
}

push() {
    if [ -z "$REGISTRY" ]; then
        log_error "REGISTRY environment variable not set"
        log_info "Usage: REGISTRY=your-registry.com ./docker.sh push"
        exit 1
    fi

    log_info "Tagging and pushing images to ${REGISTRY}..."

    docker tag "teamai/server:${VERSION}" "${REGISTRY}/teamai/server:${VERSION}"
    docker tag "teamai/web:${VERSION}" "${REGISTRY}/teamai/web:${VERSION}"

    docker push "${REGISTRY}/teamai/server:${VERSION}"
    docker push "${REGISTRY}/teamai/web:${VERSION}"

    log_info "Images pushed successfully!"
}

health() {
    log_info "Checking service health..."

    echo -n "PostgreSQL: "
    if docker compose exec -T postgres pg_isready -U "${DB_USERNAME:-teamai_dev}" -d "${DB_NAME:-teamai_dev}" > /dev/null 2>&1; then
        echo -e "${GREEN}healthy${NC}"
    else
        echo -e "${RED}unhealthy${NC}"
    fi

    echo -n "Backend: "
    if curl -s http://localhost:8080/actuator/health > /dev/null 2>&1; then
        echo -e "${GREEN}healthy${NC}"
    else
        echo -e "${RED}unhealthy${NC}"
    fi

    echo -n "Frontend: "
    if curl -s http://localhost/health > /dev/null 2>&1; then
        echo -e "${GREEN}healthy${NC}"
    else
        echo -e "${RED}unhealthy${NC}"
    fi
}

usage() {
    echo "Team AI Docker Management (Nx Standard)"
    echo ""
    echo "Usage: ./docker.sh [command]"
    echo ""
    echo "Commands:"
    echo "  build         Nx build artifacts + Nx docker image build"
    echo "  build-compose Nx build artifacts + docker compose build"
    echo "  up            Start full stack (compose profile full)"
    echo "  up-prod       Start production mode"
    echo "  down          Stop all services"
    echo "  dev           Start only PostgreSQL"
    echo "  logs          View logs (pass service name for specific)"
    echo "  health        Check health of all services"
    echo "  clean         Remove all containers, volumes, and local images"
    echo "  push          Push images to registry (set REGISTRY env var)"
    echo ""
    echo "Examples:"
    echo "  ./docker.sh build"
    echo "  ./docker.sh up"
    echo "  ./docker.sh logs server"
    echo "  VERSION=1.0.0 ./docker.sh build"
    echo "  VERSION=1.0.0 REGISTRY=ghcr.io/acme ./docker.sh push"
}

case "${1:-}" in
    build)
        build
        ;;
    build-compose)
        build_compose
        ;;
    up)
        up
        ;;
    up-prod)
        up_prod
        ;;
    down)
        down
        ;;
    dev)
        dev
        ;;
    logs)
        shift
        logs "$@"
        ;;
    health)
        health
        ;;
    clean)
        clean
        ;;
    push)
        push
        ;;
    *)
        usage
        ;;
esac
