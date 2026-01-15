# =============================================================================
# Team AI Frontend - Multi-stage Docker Build
# =============================================================================
# Stage 1: Install dependencies with pnpm
# Stage 2: Build the Vite React application
# Stage 3: Serve with Nginx Alpine
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies Installation
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /workspace

# Copy package management files first (layer caching optimization)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc* ./

# Copy all package.json files for workspace resolution
COPY apps/web/package.json apps/web/
COPY packages/resource/package.json packages/resource/
COPY packages/resource-react/package.json packages/resource-react/
COPY libs/frontend/features/feature-conversations/package.json libs/frontend/features/feature-conversations/
COPY libs/frontend/features/feature-messages/package.json libs/frontend/features/feature-messages/
COPY libs/frontend/shared/ui/package.json libs/frontend/shared/ui/
COPY libs/frontend/shared/schema/package.json libs/frontend/shared/schema/

# Install all dependencies (frozen lockfile for reproducible builds)
RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage 2: Build Stage
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /workspace

# Copy dependencies from previous stage
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /workspace/packages/resource/node_modules ./packages/resource/node_modules
COPY --from=deps /workspace/packages/resource-react/node_modules ./packages/resource-react/node_modules

# Copy source code
COPY . .

# Build the application using Nx
# First build dependencies, then the web app
RUN npx nx run-many -t build --projects=@hateoas-ts/resource,@hateoas-ts/resource-react,@shared/ui,@shared/schema --parallel=3 && \
    npx nx build web --configuration=production

# -----------------------------------------------------------------------------
# Stage 3: Production Runtime with Nginx
# -----------------------------------------------------------------------------
FROM nginx:1.25-alpine AS runtime

# Security: Remove default nginx user and create custom one
RUN deluser --remove-home nginx 2>/dev/null || true && \
    addgroup -g 101 -S nginx && \
    adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx nginx

# Remove default nginx configuration
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

# Copy custom nginx configuration
COPY apps/web/nginx.conf /etc/nginx/nginx.conf

# Copy built assets from builder stage
COPY --from=builder /workspace/apps/web/dist /usr/share/nginx/html

# Set proper permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

# Switch to non-root user
USER nginx

# Expose HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# Use exec form for proper signal handling
CMD ["nginx", "-g", "daemon off;"]
