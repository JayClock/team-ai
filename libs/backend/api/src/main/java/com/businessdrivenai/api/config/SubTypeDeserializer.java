package com.businessdrivenai.api.config;

import com.businessdrivenai.domain.description.ContextSubType;
import com.businessdrivenai.domain.description.EvidenceSubType;
import com.businessdrivenai.domain.description.LogicalEntityDescription;
import com.businessdrivenai.domain.description.ParticipantSubType;
import com.businessdrivenai.domain.description.RoleSubType;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.io.IOException;
import org.springframework.stereotype.Component;

/**
 * Jackson deserializer for LogicalEntityDescription.SubType interface. Handles the "PREFIX:value"
 * format used in HAL-FORMS options.
 */
@Component
public class SubTypeDeserializer extends JsonDeserializer<LogicalEntityDescription.SubType> {

  private static final String SEPARATOR = ":";

  @Override
  public LogicalEntityDescription.SubType deserialize(JsonParser p, DeserializationContext ctxt)
      throws IOException {
    String value = p.getText();
    if (value == null || value.isBlank()) {
      return null;
    }

    int separatorIndex = value.indexOf(SEPARATOR);
    if (separatorIndex == -1) {
      throw new IllegalArgumentException(
          "Invalid SubType format, expected 'PREFIX:value': " + value);
    }

    String prefix = value.substring(0, separatorIndex);
    String subValue = value.substring(separatorIndex + 1);

    return switch (prefix) {
      case "EVIDENCE" -> EvidenceSubType.fromValue(subValue);
      case "PARTICIPANT" -> ParticipantSubType.fromValue(subValue);
      case "ROLE" -> RoleSubType.fromValue(subValue);
      case "CONTEXT" -> ContextSubType.fromValue(subValue);
      default ->
          throw new IllegalArgumentException(
              "Unknown SubType prefix: " + prefix + ", value: " + value);
    };
  }
}
