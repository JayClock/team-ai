package reengineering.ddd.teamai.api.options;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.hateoas.mediatype.hal.forms.HalFormsConfiguration;
import org.springframework.hateoas.mediatype.hal.forms.HalFormsOptions;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.api.BizDiagramApi;
import reengineering.ddd.teamai.model.DiagramType;

/** HalForms customizer for BizDiagram API, registering diagram type options. */
@Component
public class BizDiagramHalFormsCustomizer implements HalFormsOptionsCustomizer {

  private final MessageSource messageSource;

  record DiagramTypeOption(String prompt, String value) {}

  public BizDiagramHalFormsCustomizer(MessageSource messageSource) {
    this.messageSource = messageSource;
  }

  @Override
  public HalFormsConfiguration customize(HalFormsConfiguration config) {
    return config.withOptions(
        BizDiagramApi.BizDiagramChange.class,
        "diagramType",
        metadata -> {
          Locale locale = LocaleContextHolder.getLocale();
          List<DiagramTypeOption> options =
              Arrays.stream(DiagramType.values())
                  .map(
                      type ->
                          new DiagramTypeOption(
                              messageSource.getMessage(
                                  "DiagramType." + type.name() + "._prompt",
                                  null,
                                  type.name(),
                                  locale),
                              type.getValue()))
                  .toList();

          return HalFormsOptions.inline(options).withMaxItems(1L).withMinItems(1L);
        });
  }
}
