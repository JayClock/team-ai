package reengineering.ddd.teamai.model;

/** Raised when an API key is required by the model provider but is not available. */
public class ApiKeyMissingException extends RuntimeException {
  public ApiKeyMissingException() {
    super("Missing API Key");
  }
}
