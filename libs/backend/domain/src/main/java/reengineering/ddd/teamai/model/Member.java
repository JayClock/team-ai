package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.MemberDescription;

public class Member implements Entity<String, MemberDescription> {
  private String identity;
  private MemberDescription description;

  public Member(String identity, MemberDescription description) {
    this.identity = identity;
    this.description = description;
  }

  private Member() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public MemberDescription getDescription() {
    return description;
  }
}
