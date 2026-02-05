package reengineering.ddd.teamai.description;

import java.util.List;

public record NodeStyleConfig(
    String backgroundColor,
    String textColor,
    Integer fontSize,
    Boolean collapsed,
    List<String> hiddenAttributes) {}
