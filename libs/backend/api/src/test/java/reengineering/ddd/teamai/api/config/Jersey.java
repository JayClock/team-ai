package reengineering.ddd.teamai.api.config;

import static org.springframework.hateoas.config.EnableHypermediaSupport.HypermediaType.HAL_FORMS;

import java.util.Map;
import org.glassfish.jersey.server.ResourceConfig;
import org.glassfish.jersey.server.ServerProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.hateoas.config.EnableHypermediaSupport;
import reengineering.ddd.teamai.api.RootApi;
import reengineering.ddd.teamai.api.UsersApi;

@Configuration
@EnableHypermediaSupport(type = HAL_FORMS)
public class Jersey extends ResourceConfig {
  public Jersey() {
    setProperties(Map.of(ServerProperties.RESPONSE_SET_STATUS_OVER_SEND_ERROR, true));
    register(RootApi.class);
    register(UsersApi.class);
  }
}
