# =============================================================================
# Team AI Frontend Runtime Image (Nx Artifact Driven)
# =============================================================================
# Prerequisite:
#   npx nx build @web/main
# This Dockerfile only packages prebuilt assets from apps/web/dist.
# =============================================================================

FROM nginx:1.25-alpine AS runtime

RUN deluser --remove-home nginx 2>/dev/null || true && \
    addgroup -g 101 -S nginx && \
    adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx nginx

RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*
RUN mkdir -p /var/cache/nginx /var/log/nginx
COPY nginx.conf /etc/nginx/nginx.conf
COPY dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
