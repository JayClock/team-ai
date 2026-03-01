package reengineering.ddd.teamai.mybatis.typehandler;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
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
 * MyBatis TypeHandler for the sealed SubType interface. Serializes SubType enums as raw subtype
 * values and deserializes raw values using the logical entity type in the same row.
 *
 * <p>Write format: "value" (e.g., "rfp", "party")
 */
@MappedTypes(LogicalEntityDescription.SubType.class)
public class SubTypeHandler extends BaseTypeHandler<LogicalEntityDescription.SubType> {

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, LogicalEntityDescription.SubType parameter, JdbcType jdbcType)
      throws SQLException {
    ps.setString(i, parameter.getValue());
  }

  @Override
  public LogicalEntityDescription.SubType getNullableResult(ResultSet rs, String columnName)
      throws SQLException {
    String value = rs.getString(columnName);
    return parseSubType(value, resolveType(rs));
  }

  @Override
  public LogicalEntityDescription.SubType getNullableResult(ResultSet rs, int columnIndex)
      throws SQLException {
    String value = rs.getString(columnIndex);
    return parseSubType(value, resolveType(rs));
  }

  @Override
  public LogicalEntityDescription.SubType getNullableResult(CallableStatement cs, int columnIndex)
      throws SQLException {
    String value = cs.getString(columnIndex);
    return parseSubTypeWithoutType(value);
  }

  private LogicalEntityDescription.SubType parseSubType(
      String value, LogicalEntityDescription.Type type) {
    if (value == null || value.isBlank()) {
      return null;
    }
    if (type == null) {
      return parseSubTypeWithoutType(value);
    }
    String subValue = value.trim();
    return switch (type) {
      case EVIDENCE -> EvidenceSubType.fromValue(subValue);
      case PARTICIPANT -> ParticipantSubType.fromValue(subValue);
      case ROLE -> RoleSubType.fromValue(subValue);
      case CONTEXT -> ContextSubType.fromValue(subValue);
    };
  }

  private LogicalEntityDescription.Type resolveType(ResultSet rs) {
    String typeValue = readColumn(rs, "le_type");
    if (typeValue == null || typeValue.isBlank()) {
      typeValue = readColumn(rs, "type");
    }
    if (typeValue == null || typeValue.isBlank()) {
      return null;
    }
    String normalized = typeValue.trim();
    try {
      return LogicalEntityDescription.Type.fromValue(normalized);
    } catch (IllegalArgumentException ignored) {
      return LogicalEntityDescription.Type.valueOf(normalized.toUpperCase(Locale.ROOT));
    }
  }

  private String readColumn(ResultSet rs, String columnName) {
    try {
      rs.findColumn(columnName);
      return rs.getString(columnName);
    } catch (SQLException ignored) {
      return null;
    }
  }

  private LogicalEntityDescription.SubType parseSubTypeWithoutType(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    String subValue = value.trim();
    List<LogicalEntityDescription.SubType> matches = new ArrayList<>(4);
    tryAdd(matches, () -> EvidenceSubType.fromValue(subValue));
    tryAdd(matches, () -> ParticipantSubType.fromValue(subValue));
    tryAdd(matches, () -> RoleSubType.fromValue(subValue));
    tryAdd(matches, () -> ContextSubType.fromValue(subValue));
    if (matches.size() == 1) {
      return matches.get(0);
    }
    if (matches.isEmpty()) {
      throw new IllegalArgumentException("Unknown sub-type value: " + value);
    }
    throw new IllegalArgumentException(
        "Ambiguous sub-type value without entity type: " + value + ", matches=" + matches.size());
  }

  private void tryAdd(
      List<LogicalEntityDescription.SubType> matches, SubTypeSupplier candidateSupplier) {
    try {
      matches.add(candidateSupplier.get());
    } catch (IllegalArgumentException ignored) {
      // ignore non-matching enum parser
    }
  }

  @FunctionalInterface
  private interface SubTypeSupplier {
    LogicalEntityDescription.SubType get();
  }
}
