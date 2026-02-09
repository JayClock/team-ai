package com.businessdrivenai.persistence.mybatis.typehandler;

import com.businessdrivenai.domain.model.DiagramType;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

@MappedTypes(DiagramType.class)
public class DiagramTypeHandler extends BaseTypeHandler<DiagramType> {

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, DiagramType parameter, JdbcType jdbcType) throws SQLException {
    ps.setString(i, parameter.getValue());
  }

  @Override
  public DiagramType getNullableResult(ResultSet rs, String columnName) throws SQLException {
    String value = rs.getString(columnName);
    return value == null ? null : DiagramType.fromValue(value);
  }

  @Override
  public DiagramType getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    String value = rs.getString(columnIndex);
    return value == null ? null : DiagramType.fromValue(value);
  }

  @Override
  public DiagramType getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
    String value = cs.getString(columnIndex);
    return value == null ? null : DiagramType.fromValue(value);
  }
}
