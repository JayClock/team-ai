package reengineering.ddd.teamai.infrastructure.providers;

import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import reengineering.ddd.teamai.model.ApiKeyMissingException;

interface RequestHeaderModelConfig {
  String API_KEY_HEADER = "X-Api-Key";
  String MODEL_HEADER = "X-AI-Model";

  default String resolveApiKey() {
    String apiKey = resolveHeader(API_KEY_HEADER);
    if (apiKey == null) {
      throw new ApiKeyMissingException();
    }
    return apiKey;
  }

  default String resolveModel(String defaultModel) {
    String model = resolveHeader(MODEL_HEADER);
    return model == null ? defaultModel : model;
  }

  private String resolveHeader(String headerName) {
    if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs)) {
      return null;
    }

    String value = attrs.getRequest().getHeader(headerName);
    if (value == null || value.isBlank()) {
      return null;
    }

    return value.trim();
  }
}
