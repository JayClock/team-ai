package reengineering.ddd.teamai.api.options;

/**
 * Value object for HAL-FORMS option with value and prompt. Used to render dropdown options where
 * prompt is displayed to users but value is sent to server.
 */
public record HalFormsOption(String value, String prompt) {}
