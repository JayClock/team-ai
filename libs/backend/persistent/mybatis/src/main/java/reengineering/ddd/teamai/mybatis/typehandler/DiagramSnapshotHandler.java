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
import reengineering.ddd.teamai.description.DiagramVersionDescription;
import reengineering.ddd.teamai.description.Viewport;

@MappedTypes(DiagramVersionDescription.DiagramSnapshot.class)
public class DiagramSnapshotHandler
    extends BaseTypeHandler<DiagramVersionDescription.DiagramSnapshot> {
  private static final ObjectMapper objectMapper = new ObjectMapper();

  @Override
  public void setNonNullParameter(
      PreparedStatement ps,
      int i,
      DiagramVersionDescription.DiagramSnapshot parameter,
      JdbcType jdbcType)
      throws SQLException {
    try {
      ps.setObject(i, objectMapper.writeValueAsString(parameter), Types.OTHER);
    } catch (JsonProcessingException e) {
      throw new SQLException("Failed to serialize diagram snapshot", e);
    }
  }

  @Override
  public DiagramVersionDescription.DiagramSnapshot getNullableResult(
      ResultSet rs, String columnName) throws SQLException {
    return parseSnapshot(rs.getString(columnName));
  }

  @Override
  public DiagramVersionDescription.DiagramSnapshot getNullableResult(ResultSet rs, int columnIndex)
      throws SQLException {
    return parseSnapshot(rs.getString(columnIndex));
  }

  @Override
  public DiagramVersionDescription.DiagramSnapshot getNullableResult(
      CallableStatement cs, int columnIndex) throws SQLException {
    return parseSnapshot(cs.getString(columnIndex));
  }

  private DiagramVersionDescription.DiagramSnapshot parseSnapshot(String json) throws SQLException {
    if (json == null || json.isEmpty()) {
      return new DiagramVersionDescription.DiagramSnapshot(
          List.of(), List.of(), Viewport.defaultViewport());
    }
    try {
      return objectMapper.readValue(json, DiagramVersionDescription.DiagramSnapshot.class);
    } catch (JsonProcessingException e) {
      throw new SQLException("Failed to deserialize diagram snapshot", e);
    }
  }
}
