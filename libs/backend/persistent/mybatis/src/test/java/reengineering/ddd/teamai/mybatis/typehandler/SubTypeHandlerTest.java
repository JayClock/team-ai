package reengineering.ddd.teamai.mybatis.typehandler;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import org.junit.jupiter.api.Test;
import reengineering.ddd.teamai.description.ParticipantSubType;
import reengineering.ddd.teamai.description.RoleSubType;

class SubTypeHandlerTest {

  @Test
  void should_parse_sub_type_by_value_with_type_column() throws Exception {
    SubTypeHandler handler = new SubTypeHandler();
    ResultSet rs = mock(ResultSet.class);
    when(rs.findColumn("le_type")).thenReturn(1);
    when(rs.getString("le_type")).thenReturn("Participant");
    when(rs.getString("le_sub_type")).thenReturn("PARTY");

    assertEquals(ParticipantSubType.PARTY, handler.getNullableResult(rs, "le_sub_type"));
  }

  @Test
  void should_parse_ambiguous_sub_type_using_row_type() throws Exception {
    SubTypeHandler handler = new SubTypeHandler();
    ResultSet rs = mock(ResultSet.class);
    when(rs.findColumn("le_type")).thenReturn(1);
    when(rs.getString("le_type")).thenReturn("Role");
    when(rs.getString("le_sub_type")).thenReturn("party");

    assertEquals(RoleSubType.PARTY, handler.getNullableResult(rs, "le_sub_type"));
  }

  @Test
  void should_reject_unknown_sub_type() throws Exception {
    SubTypeHandler handler = new SubTypeHandler();
    ResultSet rs = mock(ResultSet.class);
    when(rs.findColumn("le_type")).thenReturn(1);
    when(rs.getString("le_type")).thenReturn("Evidence");
    when(rs.getString("le_sub_type")).thenReturn("unknown");

    assertThrows(
        IllegalArgumentException.class, () -> handler.getNullableResult(rs, "le_sub_type"));
  }
}
