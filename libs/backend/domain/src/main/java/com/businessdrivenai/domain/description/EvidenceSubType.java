package com.businessdrivenai.domain.description;

/**
 * Sub-types for Evidence entities in Fulfillment Modeling. Represents the standard evidence types
 * in a business fulfillment process.
 */
public enum EvidenceSubType implements LogicalEntityDescription.SubType {
  RFP("rfp", TemporalType.INTERVAL),
  PROPOSAL("proposal", TemporalType.INTERVAL),
  CONTRACT("contract", TemporalType.MOMENT),
  FULFILLMENT_REQUEST("fulfillment_request", TemporalType.INTERVAL),
  FULFILLMENT_CONFIRMATION("fulfillment_confirmation", TemporalType.MOMENT),
  OTHER_EVIDENCE("other_evidence", TemporalType.MOMENT);

  private final String value;
  private final TemporalType temporalType;

  EvidenceSubType(String value, TemporalType temporalType) {
    this.value = value;
    this.temporalType = temporalType;
  }

  @Override
  public String getValue() {
    return value;
  }

  public TemporalType getTemporalType() {
    return temporalType;
  }

  public static EvidenceSubType fromValue(String value) {
    for (EvidenceSubType type : values()) {
      if (type.value.equals(value)) {
        return type;
      }
    }
    throw new IllegalArgumentException("Unknown evidence sub-type: " + value);
  }

  /**
   * Temporal classification for evidence types. MOMENT: A point in time (Contract, Confirmation,
   * Evidence) INTERVAL: A period of time (RFP, Proposal, Request)
   */
  public enum TemporalType {
    MOMENT("moment"),
    INTERVAL("interval");

    private final String value;

    TemporalType(String value) {
      this.value = value;
    }

    public String getValue() {
      return value;
    }
  }
}
