package reengineering.ddd.teamai.mybatis.typehandler;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Locale;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;
import reengineering.ddd.teamai.description.ContextSubType;
import reengineering.ddd.teamai.description.EvidenceSubType;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.ParticipantSubType;
import reengineering.ddd.teamai.description.RoleSubType;

/**
 * MyBatis TypeHandler for the sealed SubType interface. Serializes SubType enums to their string
 * value with a type prefix for disambiguation during deserialization.
 *
 * <p>Format: "TYPE_PREFIX:value" (e.g., "EVIDENCE:rfp", "ROLE:party_role")
 */
@MappedTypes(LogicalEntityDescription.SubType.class)
public class SubTypeHandler extends BaseTypeHandler<LogicalEntityDescription.SubType> {

  private static final String SEPARATOR = ":";

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, LogicalEntityDescription.SubType parameter, JdbcType jdbcType)
      throws SQLException {
    String prefix = getTypePrefix(parameter);
    ps.setString(i, prefix + SEPARATOR + parameter.getValue());
  }

  @Override
  public LogicalEntityDescription.SubType getNullableResult(ResultSet rs, String columnName)
      throws SQLException {
    String value = rs.getString(columnName);
    return parseSubType(value);
  }

  @Override
  public LogicalEntityDescription.SubType getNullableResult(ResultSet rs, int columnIndex)
      throws SQLException {
    String value = rs.getString(columnIndex);
    return parseSubType(value);
  }

  @Override
  public LogicalEntityDescription.SubType getNullableResult(CallableStatement cs, int columnIndex)
      throws SQLException {
    String value = cs.getString(columnIndex);
    return parseSubType(value);
  }

  private String getTypePrefix(LogicalEntityDescription.SubType subType) {
    if (subType instanceof EvidenceSubType) {
      return "EVIDENCE";
    } else if (subType instanceof ParticipantSubType) {
      return "PARTICIPANT";
    } else if (subType instanceof RoleSubType) {
      return "ROLE";
    } else if (subType instanceof ContextSubType) {
      return "CONTEXT";
    }
    throw new IllegalArgumentException("Unknown SubType implementation: " + subType.getClass());
  }

  private LogicalEntityDescription.SubType parseSubType(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }

    int separatorIndex = value.indexOf(SEPARATOR);
    if (separatorIndex == -1) {
      throw new IllegalArgumentException(
          "Invalid SubType format, expected 'PREFIX:value': " + value);
    }

    String prefix = value.substring(0, separatorIndex).trim().toUpperCase(Locale.ROOT);
    String subValue = value.substring(separatorIndex + 1).trim();

    return switch (prefix) {
      case "EVIDENCE" -> EvidenceSubType.fromValue(subValue);
      case "PARTICIPANT" -> ParticipantSubType.fromValue(subValue);
      case "ROLE" -> RoleSubType.fromValue(subValue);
      case "CONTEXT" -> ContextSubType.fromValue(subValue);
      default -> throw new IllegalArgumentException("Unknown SubType prefix: " + prefix);
    };
  }
}
