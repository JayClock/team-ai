package reengineering.ddd.teamai.api.options;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.hateoas.mediatype.hal.forms.HalFormsConfiguration;
import org.springframework.hateoas.mediatype.hal.forms.HalFormsOptions;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.api.LogicalEntitiesApi.CreateLogicalEntityRequest;
import reengineering.ddd.teamai.description.ContextSubType;
import reengineering.ddd.teamai.description.EvidenceSubType;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.ParticipantSubType;
import reengineering.ddd.teamai.description.RoleSubType;

/**
 * Customizer to add HAL-FORMS options for LogicalEntity type and subType fields. This provides
 * dropdowns of valid entity types and sub-types in HAL-FORMS responses with internationalized
 * prompts.
 *
 * <p>SubType options are grouped by Type with prefix format: "TYPE:value" (e.g., "EVIDENCE:rfp",
 * "PARTICIPANT:party"). This allows frontend to filter options based on selected type.
 */
@Component
public class LogicalEntityOptionsCustomizer implements HalFormsOptionsCustomizer {

  private final MessageSource messageSource;

  public LogicalEntityOptionsCustomizer(MessageSource messageSource) {
    this.messageSource = messageSource;
  }

  @Override
  public HalFormsConfiguration customize(HalFormsConfiguration config) {
    return config
        .withOptions(
            CreateLogicalEntityRequest.class,
            "type",
            metadata -> {
              Locale locale = LocaleContextHolder.getLocale();
              List<HalFormsOption> typeOptions =
                  Arrays.stream(LogicalEntityDescription.Type.values())
                      .map(
                          type -> {
                            String key = "LogicalEntityDescription.Type." + type.name();
                            String prompt =
                                messageSource.getMessage(key, null, type.name(), locale);
                            return new HalFormsOption(type.name(), prompt);
                          })
                      .toList();

              return HalFormsOptions.inline(typeOptions)
                  .withPromptField("prompt")
                  .withValueField("value")
                  .withMaxItems(1L)
                  .withMinItems(1L);
            })
        .withOptions(
            CreateLogicalEntityRequest.class,
            "subType",
            metadata -> {
              Locale locale = LocaleContextHolder.getLocale();
              List<HalFormsOption> subTypeOptions = buildSubTypeOptions(locale);

              return HalFormsOptions.inline(subTypeOptions)
                  .withPromptField("prompt")
                  .withValueField("value")
                  .withMaxItems(1L)
                  .withMinItems(0L); // subType is optional
            });
  }

  private List<HalFormsOption> buildSubTypeOptions(Locale locale) {
    List<HalFormsOption> options = new ArrayList<>();

    // Evidence sub-types
    for (EvidenceSubType subType : EvidenceSubType.values()) {
      String value = "EVIDENCE:" + subType.getValue();
      String key = "EvidenceSubType." + subType.name();
      String prompt = messageSource.getMessage(key, null, subType.name(), locale);
      options.add(new HalFormsOption(value, prompt));
    }

    // Participant sub-types
    for (ParticipantSubType subType : ParticipantSubType.values()) {
      String value = "PARTICIPANT:" + subType.getValue();
      String key = "ParticipantSubType." + subType.name();
      String prompt = messageSource.getMessage(key, null, subType.name(), locale);
      options.add(new HalFormsOption(value, prompt));
    }

    // Role sub-types
    for (RoleSubType subType : RoleSubType.values()) {
      String value = "ROLE:" + subType.getValue();
      String key = "RoleSubType." + subType.name();
      String prompt = messageSource.getMessage(key, null, subType.name(), locale);
      options.add(new HalFormsOption(value, prompt));
    }

    // Context sub-types
    for (ContextSubType subType : ContextSubType.values()) {
      String value = "CONTEXT:" + subType.getValue();
      String key = "ContextSubType." + subType.name();
      String prompt = messageSource.getMessage(key, null, subType.name(), locale);
      options.add(new HalFormsOption(value, prompt));
    }

    return options;
  }
}
