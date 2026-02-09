package com.businessdrivenai.api.config;

import com.businessdrivenai.api.RootApi;
import com.businessdrivenai.api.provider.VendorMediaTypeInterceptor;
import java.util.Map;
import org.glassfish.jersey.server.ResourceConfig;
import org.glassfish.jersey.server.ServerProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.hateoas.config.EnableHypermediaSupport;
import org.springframework.hateoas.config.EnableHypermediaSupport.HypermediaType;

@Configuration
@EnableHypermediaSupport(type = {HypermediaType.HAL, HypermediaType.HAL_FORMS})
public class Jersey extends ResourceConfig {
  public Jersey() {
    setProperties(Map.of(ServerProperties.RESPONSE_SET_STATUS_OVER_SEND_ERROR, true));
    register(RootApi.class);
    register(VendorMediaTypeInterceptor.class);
  }
}
