package reengineering.ddd.teamai.mybatis.typehandler;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;
import reengineering.ddd.teamai.description.LocalNodeData;

@MappedTypes(LocalNodeData.class)
public class LocalNodeDataHandler extends BaseTypeHandler<LocalNodeData> {
  private static final ObjectMapper objectMapper = new ObjectMapper();

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, LocalNodeData parameter, JdbcType jdbcType) throws SQLException {
    try {
      ps.setObject(i, objectMapper.writeValueAsString(parameter), Types.OTHER);
    } catch (Exception e) {
      throw new SQLException("Failed to serialize LocalNodeData", e);
    }
  }

  @Override
  public LocalNodeData getNullableResult(ResultSet rs, String columnName) throws SQLException {
    String json = rs.getString(columnName);
    return parseJson(json);
  }

  @Override
  public LocalNodeData getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    String json = rs.getString(columnIndex);
    return parseJson(json);
  }

  @Override
  public LocalNodeData getNullableResult(CallableStatement cs, int columnIndex)
      throws SQLException {
    String json = cs.getString(columnIndex);
    return parseJson(json);
  }

  private LocalNodeData parseJson(String json) throws SQLException {
    if (json == null || json.isEmpty()) {
      return new LocalNodeData(null, null, null);
    }
    try {
      return objectMapper.readValue(json, LocalNodeData.class);
    } catch (Exception e) {
      throw new SQLException("Failed to parse LocalNodeData: " + json, e);
    }
  }
}
