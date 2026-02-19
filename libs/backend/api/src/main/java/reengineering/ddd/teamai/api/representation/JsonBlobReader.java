package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import reengineering.ddd.archtype.JsonBlob;

final class JsonBlobReader {
  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
  private static final TypeReference<Map<String, Object>> MAP_TYPE =
      new TypeReference<Map<String, Object>>() {};

  private JsonBlobReader() {}

  static Map<String, Object> read(JsonBlob blob) {
    if (blob == null || blob.json() == null || blob.json().isEmpty()) {
      return Map.of();
    }
    try {
      return OBJECT_MAPPER.readValue(blob.json(), MAP_TYPE);
    } catch (Exception e) {
      return Map.of();
    }
  }
}
