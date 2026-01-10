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
    public static final String RETURN_TO_PARAM = "return_to";
    public static final String RETURN_TO_COOKIE = "return_to_cache";
    private static final int COOKIE_MAX_AGE_SECONDS = 180;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {

        String returnTo = request.getParameter(RETURN_TO_PARAM);

        if (StringUtils.hasText(returnTo)) {
            Cookie cookie = new Cookie(RETURN_TO_COOKIE, returnTo);
            cookie.setPath("/");
            cookie.setMaxAge(COOKIE_MAX_AGE_SECONDS);
            cookie.setHttpOnly(true);
            response.addCookie(cookie);
        }

        filterChain.doFilter(request, response);
    }
}
