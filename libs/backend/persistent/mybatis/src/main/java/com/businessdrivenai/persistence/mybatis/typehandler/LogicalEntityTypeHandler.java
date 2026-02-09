package com.businessdrivenai.persistence.mybatis.typehandler;

import com.businessdrivenai.domain.description.LogicalEntityDescription;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

@MappedTypes(LogicalEntityDescription.Type.class)
public class LogicalEntityTypeHandler extends BaseTypeHandler<LogicalEntityDescription.Type> {

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, LogicalEntityDescription.Type parameter, JdbcType jdbcType)
      throws SQLException {
    ps.setString(i, parameter.getValue());
  }

  @Override
  public LogicalEntityDescription.Type getNullableResult(ResultSet rs, String columnName)
      throws SQLException {
    String value = rs.getString(columnName);
    return value == null ? null : LogicalEntityDescription.Type.fromValue(value);
  }

  @Override
  public LogicalEntityDescription.Type getNullableResult(ResultSet rs, int columnIndex)
      throws SQLException {
    String value = rs.getString(columnIndex);
    return value == null ? null : LogicalEntityDescription.Type.fromValue(value);
  }

  @Override
  public LogicalEntityDescription.Type getNullableResult(CallableStatement cs, int columnIndex)
      throws SQLException {
    String value = cs.getString(columnIndex);
    return value == null ? null : LogicalEntityDescription.Type.fromValue(value);
  }
}
