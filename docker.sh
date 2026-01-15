#!/bin/bash
# =============================================================================
# Team AI Docker Management Script
# =============================================================================
# Usage: ./docker.sh [command]
# Commands:
#   build     - Build all Docker images
#   up        - Start all services (database + full stack)
#   down      - Stop all services
#   dev       - Start only database for local development
#   logs      - View logs from all services
#   clean     - Remove containers, volumes, and images
#   push      - Push images to registry
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
VERSION=${VERSION:-latest}
REGISTRY=${REGISTRY:-}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Build Docker images using Nx
build() {
    log_info "Building Docker images with Nx..."
    
    # Build backend dependencies first
    log_info "Building backend..."
    npx nx docker:build server
    
    # Build frontend
    log_info "Building frontend..."
    npx nx docker:build web
    
    log_info "Docker images built successfully!"
    docker images | grep teamai
}

# Build using docker-compose directly (alternative)
build_compose() {
    log_info "Building Docker images with docker-compose..."
    docker-compose build --parallel
    log_info "Docker images built successfully!"
}

# Start all services
up() {
    log_info "Starting all Team AI services..."
    docker-compose --profile full up -d
    log_info "Services started!"
    log_info "Frontend: http://localhost"
    log_info "Backend: http://localhost:8080"
    docker-compose ps
}

# Start production stack
up_prod() {
    log_info "Starting Team AI in production mode..."
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    log_info "Production services started!"
}

# Stop all services
down() {
    log_info "Stopping all services..."
    docker-compose --profile full down
    log_info "Services stopped."
}

# Start only database for local development
dev() {
    log_info "Starting PostgreSQL for local development..."
    docker-compose up -d postgres
    log_info "PostgreSQL is running on port 5432"
    log_info "Connection string: postgresql://teamai_dev:teamai_dev@localhost:5432/teamai_dev"
}

# View logs
logs() {
    docker-compose --profile full logs -f "$@"
}

# Clean up everything
clean() {
    log_warn "This will remove all containers, volumes, and images!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Stopping and removing containers..."
        docker-compose --profile full down -v --rmi local
        
        log_info "Removing dangling images..."
        docker image prune -f
        
        log_info "Cleanup complete!"
    fi
}

# Push images to registry
push() {
    if [ -z "$REGISTRY" ]; then
        log_error "REGISTRY environment variable not set"
        log_info "Usage: REGISTRY=your-registry.com ./docker.sh push"
        exit 1
    fi
    
    log_info "Tagging and pushing images to $REGISTRY..."
    
    docker tag teamai/server:${VERSION} ${REGISTRY}/teamai/server:${VERSION}
    docker tag teamai/web:${VERSION} ${REGISTRY}/teamai/web:${VERSION}
    
    docker push ${REGISTRY}/teamai/server:${VERSION}
    docker push ${REGISTRY}/teamai/web:${VERSION}
    
    log_info "Images pushed successfully!"
}

# Health check
health() {
    log_info "Checking service health..."
    
    echo -n "PostgreSQL: "
    if docker-compose exec -T postgres pg_isready -U teamai_dev > /dev/null 2>&1; then
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

# Show usage
usage() {
    echo "Team AI Docker Management"
    echo ""
    echo "Usage: ./docker.sh [command]"
    echo ""
    echo "Commands:"
    echo "  build         Build all Docker images using Nx"
    echo "  build-compose Build using docker-compose (alternative)"
    echo "  up            Start all services (full stack)"
    echo "  up-prod       Start in production mode"
    echo "  down          Stop all services"
    echo "  dev           Start only PostgreSQL for development"
    echo "  logs          View logs (pass service name for specific)"
    echo "  health        Check health of all services"
    echo "  clean         Remove all containers, volumes, and images"
    echo "  push          Push images to registry (set REGISTRY env var)"
    echo ""
    echo "Examples:"
    echo "  ./docker.sh dev          # Start DB for local development"
    echo "  ./docker.sh build && ./docker.sh up  # Build and run"
    echo "  ./docker.sh logs server  # View server logs"
    echo "  VERSION=1.0.0 ./docker.sh build  # Build with version tag"
}

# Main
case "$1" in
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
