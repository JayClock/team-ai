package com.businessdrivenai.domain.model;

import com.businessdrivenai.archtype.Entity;
import com.businessdrivenai.domain.description.MemberDescription;

public class Member implements Entity<String, MemberDescription> {
  private String userIdentity;
  private String role;

  public Member(String userIdentity, String role) {
    this.userIdentity = userIdentity;
    this.role = role;
  }

  private Member() {}

  @Override
  public String getIdentity() {
    return userIdentity;
  }

  public String getUserIdentity() {
    return userIdentity;
  }

  public String getRole() {
    return role;
  }

  @Override
  public MemberDescription getDescription() {
    return new MemberDescription(role);
  }
}
