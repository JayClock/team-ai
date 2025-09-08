package reengineering.ddd.teamai.mybatis.associations;

import com.vladsch.flexmark.ext.yaml.front.matter.AbstractYamlFrontMatterVisitor;
import com.vladsch.flexmark.ext.yaml.front.matter.YamlFrontMatterExtension;
import com.vladsch.flexmark.parser.Parser;
import com.vladsch.flexmark.util.ast.Node;
import com.vladsch.flexmark.util.ast.TextCollectingVisitor;
import com.vladsch.flexmark.util.data.MutableDataSet;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.description.PromptDescription;
import reengineering.ddd.teamai.model.Prompt;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Component
public class Prompts implements reengineering.ddd.teamai.model.Prompts {

  private static final String KNOWLEDGE_BASE_PATH = "classpath*:knowledge-pack/prompts/**/*.md";

  private final Map<String, Prompt> prompts = new HashMap<>();

  public void initialize() throws IOException {
    prompts.clear();

    // 使用 Spring 的 PathMatchingResourcePatternResolver 来查找资源
    PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
    Resource[] resources = resolver.getResources(KNOWLEDGE_BASE_PATH);

    for (Resource resource : resources) {
      try (InputStream inputStream = resource.getInputStream()) {
        String content = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        Prompt prompt = parseMarkdown(content);
        prompts.put(prompt.getIdentity(), prompt);
      } catch (IOException e) {
        // 记录错误，但继续处理其他文件
        System.err.println("Error reading resource: " + resource.getFilename() + ", error: " + e.getMessage());
      }
    }
  }

  @Override
  public List<Prompt> findAll() {
    return new ArrayList<>(prompts.values());
  }

  @Override
  public Optional<Prompt> findById(String id) {
    return Optional.ofNullable(prompts.get(id));
  }

  public Prompt parseMarkdown(String markdown) {
    MutableDataSet options = new MutableDataSet();
    options.set(Parser.EXTENSIONS, List.of(YamlFrontMatterExtension.create()));

    Parser parser = Parser.builder(options).build();
    Node document = parser.parse(markdown);

    AbstractYamlFrontMatterVisitor frontMatterVisitor = new AbstractYamlFrontMatterVisitor() {
    };
    TextCollectingVisitor textCollectingVisitor = new TextCollectingVisitor();
    frontMatterVisitor.visit(document);
    Map<String, List<String>> data = frontMatterVisitor.getData();

    String identifier = data.get("identifier").get(0);
    String title = data.get("title").get(0).replaceAll("^\"|\"$", "");
    String content = textCollectingVisitor.collectAndGetText(document);
    String type = data.get("type").get(0).replaceAll("^\"|\"$", "");

    return new Prompt(identifier, new PromptDescription(title, content, type));
  }
}
