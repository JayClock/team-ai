package reengineering.ddd.teamai.api.options;

import org.springframework.hateoas.mediatype.hal.forms.HalFormsConfiguration;
import org.springframework.hateoas.mediatype.hal.forms.HalFormsOptions;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.api.NodesApi.CreateNodeRequest;

@Component
public class CreateNodeRequestOptionsCustomizer implements HalFormsOptionsCustomizer {

  @Override
  public HalFormsConfiguration customize(HalFormsConfiguration config) {
    return config.withOptions(
        CreateNodeRequest.class,
        "logicalEntity.id",
        metadata -> {
          String template = "/api/projects/{projectId}/logical-entities";
          return HalFormsOptions.remote(template)
              .withMaxItems(1L)
              .withMinItems(1L)
              .withPromptField("name")
              .withValueField("id");
        });
  }
}
