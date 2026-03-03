package reengineering.ddd.teamai.mybatis.typehandler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;
import reengineering.ddd.teamai.description.TaskSpecDescription;

@MappedTypes(TaskSpecDescription.class)
public class TaskSpecJsonHandler extends BaseTypeHandler<TaskSpecDescription> {
  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, TaskSpecDescription parameter, JdbcType jdbcType)
      throws SQLException {
    try {
      ps.setObject(i, OBJECT_MAPPER.writeValueAsString(parameter), Types.OTHER);
    } catch (JsonProcessingException e) {
      throw new SQLException("Failed to serialize task spec", e);
    }
  }

  @Override
  public TaskSpecDescription getNullableResult(ResultSet rs, String columnName)
      throws SQLException {
    return parse(rs.getString(columnName));
  }

  @Override
  public TaskSpecDescription getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    return parse(rs.getString(columnIndex));
  }

  @Override
  public TaskSpecDescription getNullableResult(CallableStatement cs, int columnIndex)
      throws SQLException {
    return parse(cs.getString(columnIndex));
  }

  private TaskSpecDescription parse(String json) throws SQLException {
    if (json == null || json.isBlank()) {
      return null;
    }
    try {
      return OBJECT_MAPPER.readValue(json, TaskSpecDescription.class);
    } catch (JsonProcessingException e) {
      throw new SQLException("Failed to deserialize task spec", e);
    }
  }
}
