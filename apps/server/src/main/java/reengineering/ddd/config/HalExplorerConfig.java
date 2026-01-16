package reengineering.ddd.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * HAL Explorer configuration for development environment.
 *
 * <p>Access URLs:
 *
 * <ul>
 *   <li>/explorer - HAL Explorer main interface
 *   <li>/explorer/index.html#uri=/api - Load API root directly
 * </ul>
 *
 * <p>Usage: Start server with {@code --spring.profiles.active=dev}
 */
@Configuration
@Profile("dev")
public class HalExplorerConfig implements WebMvcConfigurer {

  @Override
  public void addViewControllers(ViewControllerRegistry registry) {
    // Redirect root to HAL Explorer with API URI pre-configured
    registry.addRedirectViewController("/", "/explorer/index.html#uri=/api");
  }
}
