package reengineering.ddd.teamai.description;

import java.util.List;
import reengineering.ddd.archtype.Ref;

public record TaskDescription(
    String title,
    String objective,
    String scope,
    List<String> acceptanceCriteria,
    List<String> verificationCommands,
    Status status,
    Ref<String> assignedTo,
    Ref<String> delegatedBy,
    String completionSummary,
    VerificationVerdict verificationVerdict,
    String verificationReport) {

  public enum Status {
    PENDING,
    IN_PROGRESS,
    REVIEW_REQUIRED,
    COMPLETED,
    NEEDS_FIX,
    BLOCKED,
    CANCELLED
  }

  public enum VerificationVerdict {
    APPROVED,
    NOT_APPROVED,
    BLOCKED
  }
}
