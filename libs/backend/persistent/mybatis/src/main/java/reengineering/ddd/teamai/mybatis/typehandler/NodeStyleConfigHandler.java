package reengineering.ddd.teamai.mybatis.typehandler;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;
import reengineering.ddd.teamai.description.NodeStyleConfig;

@MappedTypes(NodeStyleConfig.class)
public class NodeStyleConfigHandler extends BaseTypeHandler<NodeStyleConfig> {
  private static final ObjectMapper objectMapper = new ObjectMapper();

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, NodeStyleConfig parameter, JdbcType jdbcType)
      throws SQLException {
    try {
      ps.setObject(i, objectMapper.writeValueAsString(parameter), Types.OTHER);
    } catch (Exception e) {
      throw new SQLException("Failed to serialize NodeStyleConfig", e);
    }
  }

  @Override
  public NodeStyleConfig getNullableResult(ResultSet rs, String columnName) throws SQLException {
    String json = rs.getString(columnName);
    return parseJson(json);
  }

  @Override
  public NodeStyleConfig getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    String json = rs.getString(columnIndex);
    return parseJson(json);
  }

  @Override
  public NodeStyleConfig getNullableResult(CallableStatement cs, int columnIndex)
      throws SQLException {
    String json = cs.getString(columnIndex);
    return parseJson(json);
  }

  private NodeStyleConfig parseJson(String json) throws SQLException {
    if (json == null || json.isEmpty()) {
      return new NodeStyleConfig(null, null, null, false, java.util.List.of());
    }
    try {
      return objectMapper.readValue(json, new TypeReference<NodeStyleConfig>() {});
    } catch (Exception e) {
      throw new SQLException("Failed to parse NodeStyleConfig: " + json, e);
    }
  }
}
