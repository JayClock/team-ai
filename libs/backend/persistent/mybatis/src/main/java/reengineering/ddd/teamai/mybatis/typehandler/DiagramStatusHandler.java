package reengineering.ddd.teamai.mybatis.typehandler;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;
import reengineering.ddd.teamai.model.DiagramStatus;

@MappedTypes(DiagramStatus.class)
public class DiagramStatusHandler extends BaseTypeHandler<DiagramStatus> {

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, DiagramStatus parameter, JdbcType jdbcType) throws SQLException {
    ps.setString(i, parameter.getValue());
  }

  @Override
  public DiagramStatus getNullableResult(ResultSet rs, String columnName) throws SQLException {
    String value = rs.getString(columnName);
    return value == null ? null : DiagramStatus.fromValue(value);
  }

  @Override
  public DiagramStatus getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    String value = rs.getString(columnIndex);
    return value == null ? null : DiagramStatus.fromValue(value);
  }

  @Override
  public DiagramStatus getNullableResult(CallableStatement cs, int columnIndex)
      throws SQLException {
    String value = cs.getString(columnIndex);
    return value == null ? null : DiagramStatus.fromValue(value);
  }
}
