package reengineering.ddd.teamai.api.options;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.hateoas.mediatype.hal.forms.HalFormsConfiguration;
import org.springframework.hateoas.mediatype.hal.forms.HalFormsOptions;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.api.LogicalEntitiesApi.CreateLogicalEntityRequest;
import reengineering.ddd.teamai.description.LogicalEntityDescription;

/**
 * Customizer to add HAL-FORMS options for LogicalEntity type field. This provides a dropdown of
 * valid entity types in HAL-FORMS responses with internationalized prompts.
 */
@Component
public class LogicalEntityOptionsCustomizer implements HalFormsOptionsCustomizer {

  private final MessageSource messageSource;

  public LogicalEntityOptionsCustomizer(MessageSource messageSource) {
    this.messageSource = messageSource;
  }

  @Override
  public HalFormsConfiguration customize(HalFormsConfiguration config) {
    return config.withOptions(
        CreateLogicalEntityRequest.class,
        "type",
        metadata -> {
          Locale locale = LocaleContextHolder.getLocale();
          List<HalFormsOption> typeOptions =
              Arrays.stream(LogicalEntityDescription.Type.values())
                  .map(
                      type -> {
                        String key = "LogicalEntityDescription.Type." + type.name();
                        String prompt = messageSource.getMessage(key, null, type.name(), locale);
                        return new HalFormsOption(type.name(), prompt);
                      })
                  .toList();

          return HalFormsOptions.inline(typeOptions)
              .withPromptField("prompt")
              .withValueField("value")
              .withMaxItems(1L)
              .withMinItems(1L);
        });
  }
}
