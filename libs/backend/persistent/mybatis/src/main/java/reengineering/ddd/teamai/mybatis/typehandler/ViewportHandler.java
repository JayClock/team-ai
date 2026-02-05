package reengineering.ddd.teamai.mybatis.typehandler;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;
import reengineering.ddd.teamai.description.Viewport;

@MappedTypes(Viewport.class)
public class ViewportHandler extends BaseTypeHandler<Viewport> {

  @Override
  public void setNonNullParameter(
      PreparedStatement ps, int i, Viewport parameter, JdbcType jdbcType) throws SQLException {
    String json =
        String.format(
            "{\"x\":%.2f,\"y\":%.2f,\"zoom\":%.2f}",
            parameter.x(), parameter.y(), parameter.zoom());
    ps.setObject(i, json, Types.OTHER);
  }

  @Override
  public Viewport getNullableResult(ResultSet rs, String columnName) throws SQLException {
    String json = rs.getString(columnName);
    return parseJson(json);
  }

  @Override
  public Viewport getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    String json = rs.getString(columnIndex);
    return parseJson(json);
  }

  @Override
  public Viewport getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
    String json = cs.getString(columnIndex);
    return parseJson(json);
  }

  private Viewport parseJson(String json) throws SQLException {
    if (json == null || json.isEmpty()) {
      return Viewport.defaultViewport();
    }
    try {
      String cleanJson = json.trim();
      double x = extractDouble(cleanJson, "x");
      double y = extractDouble(cleanJson, "y");
      double zoom = extractDouble(cleanJson, "zoom");
      return new Viewport(x, y, zoom);
    } catch (Exception e) {
      throw new SQLException("Failed to parse Viewport: " + json, e);
    }
  }

  private double extractDouble(String json, String key) {
    String pattern = "\"" + key + "\"";
    int keyIndex = json.indexOf(pattern);
    if (keyIndex == -1) {
      return 0;
    }
    int colonIndex = json.indexOf(":", keyIndex);
    if (colonIndex == -1) {
      return 0;
    }
    int startIndex = colonIndex + 1;
    while (startIndex < json.length() && Character.isWhitespace(json.charAt(startIndex))) {
      startIndex++;
    }
    startIndex = startIndex + (json.charAt(startIndex) == '\"' ? 1 : 0);
    int endIndex = startIndex;
    while (endIndex < json.length()
        && (Character.isDigit(json.charAt(endIndex))
            || json.charAt(endIndex) == '.'
            || json.charAt(endIndex) == '-'
            || json.charAt(endIndex) == 'E'
            || json.charAt(endIndex) == 'e')) {
      endIndex++;
    }
    String numberStr = json.substring(startIndex, endIndex);
    if (numberStr.isEmpty()) {
      return 0;
    }
    return Double.parseDouble(numberStr);
  }
}
