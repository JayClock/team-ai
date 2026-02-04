package reengineering.ddd.teamai.mybatis.typehandler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.List;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;
import reengineering.ddd.teamai.description.EntityDefinition;

@MappedTypes(EntityDefinition.class)
public class EntityDefinitionHandler extends BaseTypeHandler<EntityDefinition> {
  private static final ObjectMapper objectMapper = new ObjectMapper();

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, EntityDefinition parameter, JdbcType jdbcType)
      throws SQLException {
    try {
      ps.setObject(i, objectMapper.writeValueAsString(parameter), Types.OTHER);
    } catch (JsonProcessingException e) {
      throw new SQLException("Failed to serialize EntityDefinition", e);
    }
  }

  @Override
  public EntityDefinition getNullableResult(ResultSet rs, String columnName) throws SQLException {
    String json = rs.getString(columnName);
    return parseJson(json);
  }

  @Override
  public EntityDefinition getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    String json = rs.getString(columnIndex);
    return parseJson(json);
  }

  @Override
  public EntityDefinition getNullableResult(CallableStatement cs, int columnIndex)
      throws SQLException {
    String json = cs.getString(columnIndex);
    return parseJson(json);
  }

  private EntityDefinition parseJson(String json) throws SQLException {
    if (json == null || json.isEmpty()) {
      return new EntityDefinition("", List.of(), List.of(), List.of());
    }
    try {
      return objectMapper.readValue(json, EntityDefinition.class);
    } catch (Exception e) {
      throw new SQLException("Failed to parse EntityDefinition: " + json, e);
    }
  }
}
