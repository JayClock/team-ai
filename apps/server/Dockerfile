# =============================================================================
# Team AI Backend Runtime Image (Nx Artifact Driven)
# =============================================================================
# Prerequisite:
#   npx nx build :apps:server
# This Dockerfile only packages prebuilt artifacts from apps/server/build/libs.
# =============================================================================

FROM eclipse-temurin:17-jre AS runtime

RUN groupadd -r teamai && \
    useradd -r -g teamai -m -s /usr/sbin/nologin teamai

WORKDIR /app

# Copy server jars produced by Nx/Gradle build and select the non-plain boot jar.
COPY build/libs/*.jar /app/libs/
RUN set -eux; \
    jar="$(find /app/libs -maxdepth 1 -type f -name '*.jar' ! -name '*-plain.jar' | head -n 1)"; \
    test -n "${jar}"; \
    mv "${jar}" /app/app.jar; \
    rm -rf /app/libs; \
    chown -R teamai:teamai /app
USER teamai

EXPOSE 8080

ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"
ENV SPRING_PROFILES_ACTIVE=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
