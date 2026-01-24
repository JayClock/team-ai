package reengineering.ddd.teamai.api.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import java.util.Arrays;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.hateoas.mediatype.MessageResolver;
import org.springframework.hateoas.mediatype.hal.CurieProvider;
import org.springframework.hateoas.mediatype.hal.HalConfiguration;
import org.springframework.hateoas.mediatype.hal.Jackson2HalModule;
import org.springframework.hateoas.mediatype.hal.forms.HalFormsConfiguration;
import org.springframework.hateoas.mediatype.hal.forms.HalFormsOptions;
import org.springframework.hateoas.mediatype.hal.forms.Jackson2HalFormsModule;
import org.springframework.hateoas.server.LinkRelationProvider;
import reengineering.ddd.teamai.model.BizDiagram;
import reengineering.ddd.teamai.model.DiagramType;

@Configuration
public class HAL implements InitializingBean {
  private final ObjectMapper mapper;
  private final LinkRelationProvider provider;
  private final MessageResolver resolver;
  private final HalConfiguration halConfiguration;
  private final AutowireCapableBeanFactory beanFactory;

  @Inject
  public HAL(
      ObjectMapper mapper,
      LinkRelationProvider provider,
      MessageResolver resolver,
      HalConfiguration halConfiguration,
      AutowireCapableBeanFactory beanFactory) {
    this.mapper = mapper;
    this.provider = provider;
    this.resolver = resolver;
    this.halConfiguration = halConfiguration;
    this.beanFactory = beanFactory;
  }

  @Override
  public void afterPropertiesSet() {
    mapper.registerModule(new Jackson2HalModule());
    mapper.registerModule(new Jackson2HalFormsModule());
    mapper.setHandlerInstantiator(
        new Jackson2HalModule.HalHandlerInstantiator(
            provider, CurieProvider.NONE, resolver, halConfiguration, beanFactory));
  }

  @Bean
  HalFormsConfiguration halFormsConfiguration() {
    return new HalFormsConfiguration()
        .withOptions(
            BizDiagram.BizDiagramChange.class,
            "diagramType",
            metadata -> HalFormsOptions.inline(
                Arrays.stream(DiagramType.values()).toArray(DiagramType[]::new))
                .withMaxItems(1L)
                .withMinItems(1L));
  }
}
