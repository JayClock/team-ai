package reengineering.ddd.teamai.api.config;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import java.io.IOException;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.description.ContextSubType;
import reengineering.ddd.teamai.description.EvidenceSubType;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.ParticipantSubType;
import reengineering.ddd.teamai.description.RoleSubType;

/**
 * Jackson serializer for LogicalEntityDescription.SubType interface. Serializes to the
 * "PREFIX:value" format used in HAL-FORMS options.
 */
@Component
public class SubTypeSerializer extends JsonSerializer<LogicalEntityDescription.SubType> {

  private static final String SEPARATOR = ":";

  @Override
  public void serialize(
      LogicalEntityDescription.SubType value, JsonGenerator gen, SerializerProvider provider)
      throws IOException {
    if (value == null) {
      gen.writeNull();
      return;
    }

    String prefix = getTypePrefix(value);
    String subValue = value.getValue();
    gen.writeString(prefix + SEPARATOR + subValue);
  }

  private String getTypePrefix(LogicalEntityDescription.SubType subType) {
    if (subType instanceof EvidenceSubType) {
      return "EVIDENCE";
    } else if (subType instanceof ParticipantSubType) {
      return "PARTICIPANT";
    } else if (subType instanceof RoleSubType) {
      return "ROLE";
    } else if (subType instanceof ContextSubType) {
      return "CONTEXT";
    }
    throw new IllegalArgumentException("Unknown SubType implementation: " + subType.getClass());
  }
}
