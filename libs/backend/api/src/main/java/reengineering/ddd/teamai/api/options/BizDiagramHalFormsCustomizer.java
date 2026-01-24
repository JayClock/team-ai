package reengineering.ddd.teamai.api.options;

import org.springframework.hateoas.mediatype.hal.forms.HalFormsConfiguration;
import org.springframework.hateoas.mediatype.hal.forms.HalFormsOptions;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.model.BizDiagram;
import reengineering.ddd.teamai.model.DiagramType;

/** HalForms customizer for BizDiagram API, registering diagram type options. */
@Component
public class BizDiagramHalFormsCustomizer implements HalFormsOptionsCustomizer {

  @Override
  public HalFormsConfiguration customize(HalFormsConfiguration config) {
    return config.withOptions(
        BizDiagram.BizDiagramChange.class,
        "diagramType",
        metadata -> HalFormsOptions.inline(DiagramType.values()).withMaxItems(1L).withMinItems(1L));
  }
}
