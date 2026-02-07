package reengineering.ddd.teamai.mybatis.typehandler;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;
import reengineering.ddd.teamai.description.ContextSubType;
import reengineering.ddd.teamai.description.EvidenceSubType;
import reengineering.ddd.teamai.description.ParticipantSubType;
import reengineering.ddd.teamai.description.RoleSubType;
import reengineering.ddd.teamai.description.SubType;

/**
 * MyBatis TypeHandler for the sealed SubType interface. Serializes SubType enums to their string
 * value with a type prefix for disambiguation during deserialization.
 *
 * <p>Format: "TYPE_PREFIX:value" (e.g., "EVIDENCE:rfp", "ROLE:party_role")
 */
@MappedTypes(SubType.class)
public class SubTypeHandler extends BaseTypeHandler<SubType> {

  private static final String SEPARATOR = ":";

  @Override
  public void setNonNullParameter(PreparedStatement ps, int i, SubType parameter, JdbcType jdbcType)
      throws SQLException {
    String prefix = getTypePrefix(parameter);
    ps.setString(i, prefix + SEPARATOR + parameter.getValue());
  }

  @Override
  public SubType getNullableResult(ResultSet rs, String columnName) throws SQLException {
    String value = rs.getString(columnName);
    return parseSubType(value);
  }

  @Override
  public SubType getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    String value = rs.getString(columnIndex);
    return parseSubType(value);
  }

  @Override
  public SubType getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
    String value = cs.getString(columnIndex);
    return parseSubType(value);
  }

  private String getTypePrefix(SubType subType) {
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

  private SubType parseSubType(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }

    int separatorIndex = value.indexOf(SEPARATOR);
    if (separatorIndex == -1) {
      throw new IllegalArgumentException(
          "Invalid SubType format, expected 'PREFIX:value': " + value);
    }

    String prefix = value.substring(0, separatorIndex);
    String subValue = value.substring(separatorIndex + 1);

    return switch (prefix) {
      case "EVIDENCE" -> EvidenceSubType.fromValue(subValue);
      case "PARTICIPANT" -> ParticipantSubType.fromValue(subValue);
      case "ROLE" -> RoleSubType.fromValue(subValue);
      case "CONTEXT" -> ContextSubType.fromValue(subValue);
      default -> throw new IllegalArgumentException("Unknown SubType prefix: " + prefix);
    };
  }
}
