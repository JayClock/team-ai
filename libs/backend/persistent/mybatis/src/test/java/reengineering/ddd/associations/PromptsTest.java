package reengineering.ddd.associations;

import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import reengineering.ddd.BaseTestContainersTest;
import reengineering.ddd.teamai.model.Prompt;
import reengineering.ddd.teamai.mybatis.associations.Prompts;

import static org.junit.jupiter.api.Assertions.assertEquals;

@MybatisTest
public class PromptsTest extends BaseTestContainersTest {
  @Inject
  private Prompts prompts;

  @Test
  public void should_parse_md_to_prompt() {
    Prompt prompt = prompts.parseMarkdown("""
      ---
      identifier: requirements-breakdown-3a845a85
      title: "Requirements Breakdown"
      system: "You are a member of a software engineering team and are assisting me in requirements analysis."
      categories: ["analysis"]
      type: "cards"

      help_prompt_description: "Break down a larger requirement into smaller work packages"
      help_user_input: "Describe the requirement you want to break down"

      ---
      You are a member of a software engineering team and are assisting me in requirements analysis.
      """);
    assertEquals("requirements-breakdown-3a845a85", prompt.getIdentity());
    assertEquals("Requirements Breakdown", prompt.getDescription().title());
    assertEquals("cards", prompt.getDescription().type());
    assertEquals("You are a member of a software engineering team and are assisting me in requirements analysis.", prompt.getDescription().content());
  }

  @Test
  public void should_find_all_prompts_for_knowledge_pack() {
    assertEquals(4, prompts.findAll().size());
  }
}
