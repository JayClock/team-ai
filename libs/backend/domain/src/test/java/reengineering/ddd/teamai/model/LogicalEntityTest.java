package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import reengineering.ddd.teamai.description.EntityAttribute;
import reengineering.ddd.teamai.description.EntityBehavior;
import reengineering.ddd.teamai.description.EntityDefinition;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.LogicalEntityDescription.Type;

@ExtendWith(MockitoExtension.class)
public class LogicalEntityTest {
  private LogicalEntity entity;
  private LogicalEntityDescription description;

  @BeforeEach
  public void setUp() {
    EntityAttribute orderAttribute =
        new EntityAttribute("attr-1", "orderId", "订单编号", "UUID", "全局唯一标识", true, false, "public");

    EntityBehavior payBehavior =
        new EntityBehavior("m-1", "pay()", "支付", "触发支付流程，状态流转为 PAID", "void");

    EntityDefinition entityDefinition =
        new EntityDefinition(
            "客户购买商品生成的交易凭证，是交易上下文的核心。",
            List.of("Core Domain", "Transaction"),
            List.of(orderAttribute),
            List.of(payBehavior));

    description =
        new LogicalEntityDescription(
            Type.EVIDENCE, null, "Order", "销售订单", entityDefinition, "DRAFT");

    entity = new LogicalEntity("entity-1", description);
  }

  @Test
  public void should_return_identity() {
    assertEquals("entity-1", entity.getIdentity());
  }

  @Test
  public void should_return_description() {
    assertEquals(description, entity.getDescription());
  }

  @Test
  public void should_return_entity_type() {
    assertEquals(Type.EVIDENCE, entity.getDescription().type());
  }

  @Test
  public void should_return_entity_name() {
    assertEquals("Order", entity.getDescription().name());
  }

  @Test
  public void should_return_entity_label() {
    assertEquals("销售订单", entity.getDescription().label());
  }

  @Test
  public void should_return_entity_definition() {
    EntityDefinition definition = entity.getDescription().definition();
    assertNotNull(definition);
    assertEquals("客户购买商品生成的交易凭证，是交易上下文的核心。", definition.description());
  }

  @Test
  public void should_return_entity_tags() {
    List<String> tags = entity.getDescription().definition().tags();
    assertNotNull(tags);
    assertEquals(2, tags.size());
    assertTrue(tags.contains("Core Domain"));
    assertTrue(tags.contains("Transaction"));
  }

  @Test
  public void should_return_entity_attributes() {
    List<EntityAttribute> attributes = entity.getDescription().definition().attributes();
    assertNotNull(attributes);
    assertEquals(1, attributes.size());

    EntityAttribute attribute = attributes.get(0);
    assertEquals("attr-1", attribute.id());
    assertEquals("orderId", attribute.name());
    assertEquals("订单编号", attribute.label());
    assertEquals("UUID", attribute.type());
    assertTrue(attribute.isBusinessKey());
  }

  @Test
  public void should_return_entity_behaviors() {
    List<EntityBehavior> behaviors = entity.getDescription().definition().behaviors();
    assertNotNull(behaviors);
    assertEquals(1, behaviors.size());

    EntityBehavior behavior = behaviors.get(0);
    assertEquals("m-1", behavior.id());
    assertEquals("pay()", behavior.name());
    assertEquals("支付", behavior.label());
    assertEquals("触发支付流程，状态流转为 PAID", behavior.description());
  }

  @Test
  public void should_return_entity_status() {
    assertEquals("DRAFT", entity.getDescription().status());
  }
}
