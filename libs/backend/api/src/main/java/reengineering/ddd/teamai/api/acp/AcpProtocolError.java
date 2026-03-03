package reengineering.ddd.teamai.api.acp;

public enum AcpProtocolError {
  INVALID_REQUEST(-32600, 400, false, "ACP_INVALID_REQUEST"),
  METHOD_NOT_FOUND(-32601, 404, false, "ACP_METHOD_NOT_FOUND"),
  INVALID_PARAMS(-32602, 400, false, "ACP_INVALID_PARAMS"),
  FORBIDDEN(-32003, 403, false, "ACP_FORBIDDEN"),
  PROJECT_NOT_FOUND(-32040, 404, false, "ACP_PROJECT_NOT_FOUND"),
  SESSION_NOT_FOUND(-32004, 404, false, "ACP_SESSION_NOT_FOUND"),
  RUNTIME_FAILED(-32050, 502, true, "ACP_RUNTIME_FAILED"),
  RUNTIME_TIMEOUT(-32060, 504, true, "ACP_RUNTIME_TIMEOUT"),
  INTERNAL(-32603, 500, true, "ACP_INTERNAL");

  private final int jsonRpcCode;
  private final int httpStatus;
  private final boolean retryable;
  private final String acpCode;

  AcpProtocolError(int jsonRpcCode, int httpStatus, boolean retryable, String acpCode) {
    this.jsonRpcCode = jsonRpcCode;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.acpCode = acpCode;
  }

  public int jsonRpcCode() {
    return jsonRpcCode;
  }

  public int httpStatus() {
    return httpStatus;
  }

  public boolean retryable() {
    return retryable;
  }

  public String acpCode() {
    return acpCode;
  }
}
