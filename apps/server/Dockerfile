# =============================================================================
# Team AI Backend - Multi-stage Docker Build
# =============================================================================
# Stage 1: Build the Spring Boot application with Gradle
# Stage 2: Create minimal runtime image with the bootJar
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Gradle Build Stage
# -----------------------------------------------------------------------------
FROM eclipse-temurin:17-jdk-alpine AS builder

# Install necessary build tools
RUN apk add --no-cache bash

WORKDIR /workspace

# Copy Gradle wrapper and configuration first (layer caching optimization)
COPY gradlew gradlew
COPY gradle gradle
COPY build.gradle build.gradle
COPY settings.gradle settings.gradle

# Copy all library modules (required for multi-module build)
COPY libs/backend libs/backend

# Copy the server application
COPY apps/server apps/server

# Make Gradle wrapper executable and download dependencies (cached layer)
RUN chmod +x gradlew && ./gradlew dependencies --no-daemon

# Build the bootJar (skip tests for Docker build - tests run in CI)
RUN ./gradlew :apps:server:bootJar --no-daemon -x test

# Extract the layered jar for optimized Docker caching
RUN mkdir -p build/extracted && \
    java -Djarmode=layertools -jar apps/server/build/libs/*.jar extract --destination build/extracted

# -----------------------------------------------------------------------------
# Stage 2: Runtime Stage
# -----------------------------------------------------------------------------
FROM eclipse-temurin:17-jre-alpine AS runtime

# Security: Create non-root user for running the application
RUN addgroup -g 1000 teamai && \
    adduser -u 1000 -G teamai -s /bin/sh -D teamai

WORKDIR /app

# Copy extracted layers (optimized for Docker layer caching)
# Order from least to most frequently changing
COPY --from=builder /workspace/build/extracted/dependencies/ ./
COPY --from=builder /workspace/build/extracted/spring-boot-loader/ ./
COPY --from=builder /workspace/build/extracted/snapshot-dependencies/ ./
COPY --from=builder /workspace/build/extracted/application/ ./

# Change ownership to non-root user
RUN chown -R teamai:teamai /app

# Switch to non-root user
USER teamai

# Expose the application port
EXPOSE 8080

# Configure JVM options for containers
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"

# Spring Boot configuration
ENV SPRING_PROFILES_ACTIVE=production

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health || exit 1

# Use exec form for proper signal handling (SIGTERM graceful shutdown)
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS org.springframework.boot.loader.launch.JarLauncher"]
