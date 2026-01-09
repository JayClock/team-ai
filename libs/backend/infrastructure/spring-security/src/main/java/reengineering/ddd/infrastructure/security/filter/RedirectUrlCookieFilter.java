package reengineering.ddd.infrastructure.security.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

public class RedirectUrlCookieFilter extends OncePerRequestFilter {
    public static final String REDIRECT_URI_PARAM = "redirect_uri";
    public static final String REDIRECT_URI_COOKIE = "redirect_uri_cache";
    private static final int COOKIE_MAX_AGE_SECONDS = 180;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {

        String redirectUri = request.getParameter(REDIRECT_URI_PARAM);

        if (StringUtils.hasText(redirectUri)) {
            Cookie cookie = new Cookie(REDIRECT_URI_COOKIE, redirectUri);
            cookie.setPath("/");
            cookie.setMaxAge(COOKIE_MAX_AGE_SECONDS);
            cookie.setHttpOnly(true);
            response.addCookie(cookie);
        }

        filterChain.doFilter(request, response);
    }
}
