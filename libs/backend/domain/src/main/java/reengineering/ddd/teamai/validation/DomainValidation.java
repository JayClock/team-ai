package reengineering.ddd.teamai.validation;

import reengineering.ddd.archtype.Ref;

public final class DomainValidation {
  private DomainValidation() {}

  public static void requireText(String value, String fieldName) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(fieldName + " must not be blank");
    }
  }

  public static String requireTrimmedText(String value, String fieldName) {
    requireText(value, fieldName);
    return value.trim();
  }

  public static void requireRef(Ref<String> value, String fieldName) {
    if (value == null || value.id() == null || value.id().isBlank()) {
      throw new IllegalArgumentException(fieldName + " must not be blank");
    }
  }
}
