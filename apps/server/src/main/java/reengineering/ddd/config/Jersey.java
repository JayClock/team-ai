package reengineering.ddd.config;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Map;
import org.glassfish.jersey.server.ResourceConfig;
import org.glassfish.jersey.server.ServerProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.hateoas.config.EnableHypermediaSupport;
import org.springframework.hateoas.config.EnableHypermediaSupport.HypermediaType;
import org.springframework.lang.NonNull;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.filter.ShallowEtagHeaderFilter;
import reengineering.ddd.teamai.api.RootApi;
import reengineering.ddd.teamai.api.UsersApi;

@Configuration
@EnableHypermediaSupport(type = {HypermediaType.HAL, HypermediaType.HAL_FORMS})
public class Jersey extends ResourceConfig {
  public Jersey() {
    setProperties(Map.of(ServerProperties.RESPONSE_SET_STATUS_OVER_SEND_ERROR, true));
    register(RootApi.class);
    register(UsersApi.class);
  }

  @Bean
  public FilterRegistrationBean<ShallowEtagHeaderFilterWithoutSse> shallowEtagHeaderFilter() {
    FilterRegistrationBean<ShallowEtagHeaderFilterWithoutSse> registrationBean =
        new FilterRegistrationBean<>();
    registrationBean.setFilter(new ShallowEtagHeaderFilterWithoutSse());
    registrationBean.addUrlPatterns("/*");
    return registrationBean;
  }

  public static class ShallowEtagHeaderFilterWithoutSse extends OncePerRequestFilter {
    private final ShallowEtagHeaderFilter delegate = new ShallowEtagHeaderFilter();

    @Override
    protected void doFilterInternal(
        @NonNull HttpServletRequest request,
        jakarta.servlet.http.HttpServletResponse response,
        jakarta.servlet.FilterChain filterChain)
        throws jakarta.servlet.ServletException, IOException {
      if (shouldNotFilter(request)) {
        filterChain.doFilter(request, response);
      } else {
        delegate.doFilter(request, response, filterChain);
      }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
      String uri = request.getRequestURI();
      return uri.endsWith("/stream");
    }
  }
}
