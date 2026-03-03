package reengineering.ddd.teamai.description;

import java.util.List;
import java.util.Objects;

public record TaskSpecDescription(
    String version,
    List<Step> steps,
    List<Dependency> dependencies,
    List<String> acceptanceCriteria,
    List<String> verificationCommands) {

  public TaskSpecDescription {
    String normalizedVersion = version == null || version.isBlank() ? "1.0" : version.trim();
    List<Step> normalizedSteps = steps == null ? List.of() : List.copyOf(steps);
    if (normalizedSteps.stream().anyMatch(Objects::isNull)) {
      throw new IllegalArgumentException("steps must not contain null");
    }
    List<Dependency> normalizedDependencies =
        dependencies == null ? List.of() : List.copyOf(dependencies);
    if (normalizedDependencies.stream().anyMatch(Objects::isNull)) {
      throw new IllegalArgumentException("dependencies must not contain null");
    }
    List<String> normalizedAcceptance =
        acceptanceCriteria == null ? List.of() : List.copyOf(acceptanceCriteria);
    List<String> normalizedVerification =
        verificationCommands == null ? List.of() : List.copyOf(verificationCommands);

    version = normalizedVersion;
    steps = normalizedSteps;
    dependencies = normalizedDependencies;
    acceptanceCriteria = normalizedAcceptance;
    verificationCommands = normalizedVerification;
  }

  public record Step(String id, String title, String objective) {
    public Step {
      if (id == null || id.isBlank()) {
        throw new IllegalArgumentException("step.id must not be blank");
      }
      if (title == null || title.isBlank()) {
        throw new IllegalArgumentException("step.title must not be blank");
      }
      if (objective == null || objective.isBlank()) {
        throw new IllegalArgumentException("step.objective must not be blank");
      }
      id = id.trim();
      title = title.trim();
      objective = objective.trim();
    }
  }

  public record Dependency(String fromStepId, String toStepId) {
    public Dependency {
      if (fromStepId == null || fromStepId.isBlank()) {
        throw new IllegalArgumentException("dependency.fromStepId must not be blank");
      }
      if (toStepId == null || toStepId.isBlank()) {
        throw new IllegalArgumentException("dependency.toStepId must not be blank");
      }
      fromStepId = fromStepId.trim();
      toStepId = toStepId.trim();
    }
  }
}
