package reengineering.ddd.knowledgegraph.extractor.infrastructure;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.dom4j.Document;
import org.dom4j.DocumentException;
import org.dom4j.Element;
import org.dom4j.io.SAXReader;
import reengineering.ddd.knowledgegraph.extractor.BaseExtractor;
import reengineering.ddd.knowledgegraph.model.*;

public class XMLMapperExtractor extends BaseExtractor {

  public XMLMapperExtractor(Graph graph) {
    super(graph);
  }

  @Override
  public void extract(Path basePath) {
    Path xmlPath =
        basePath.resolve("libs/backend/persistent/mybatis/src/main/resources/mybatis.mappers");
    List<File> xmlFiles = findXMLFiles(xmlPath);

    SAXReader reader = new SAXReader();

    for (File file : xmlFiles) {
      try {
        Document document = reader.read(file);
        Element root = document.getRootElement();

        String namespace = root.attributeValue("namespace");
        String xmlFilePath = file.getAbsolutePath();

        XMLMapperNode xmlNode = new XMLMapperNode(namespace, xmlFilePath, xmlFilePath);
        graph.addNode(xmlNode);

        graph.addRelationship(
            new Relationship(
                xmlNode.getId(),
                "LAYER:" + Layer.INFRASTRUCTURE_LAYER.name(),
                Relationship.Type.BELONGS_TO));

        graph.addRelationship(
            new Relationship(xmlNode.getId(), "MAPPER:" + namespace, Relationship.Type.BINDS_TO));

        extractStatements(root, namespace, xmlFilePath);

      } catch (DocumentException e) {
        throw new RuntimeException("Failed to parse XML file: " + file.getName(), e);
      }
    }
  }

  private void extractStatements(Element root, String namespace, String xmlFilePath) {
    root.elements()
        .forEach(
            element -> {
              String statementType = element.getQualifiedName();
              String statementId = element.attributeValue("id");
              String statementName = namespace + "." + statementId;

              MethodNode statementNode =
                  new MethodNode(
                      namespace,
                      statementId + "_SQL",
                      statementType.toUpperCase() + " statement",
                      "public",
                      xmlFilePath);
              graph.addNode(statementNode);

              graph.addRelationship(
                  new Relationship(
                      "XML:" + namespace, statementNode.getId(), Relationship.Type.CONTAINS));

              extractTableReferences(element, statementNode);
            });
  }

  private void extractTableReferences(Element element, MethodNode statementNode) {
    String sqlText = element.getTextTrim();

    Pattern tablePattern =
        Pattern.compile(
            "(?:FROM|INTO|UPDATE|JOIN)\\s+([a-zA-Z_][a-zA-Z0-9_]*)", Pattern.CASE_INSENSITIVE);

    Matcher matcher = tablePattern.matcher(sqlText);
    while (matcher.find()) {
      String tableName = matcher.group(1);

      DatabaseTableNode tableNode = new DatabaseTableNode(tableName);
      graph.addNode(tableNode);

      graph.addRelationship(
          new Relationship(
              statementNode.getId(), tableNode.getId(), Relationship.Type.OPERATES_ON));

      if (element.getQualifiedName().equals("select")) {
        graph.addRelationship(
            new Relationship(
                statementNode.getId(), tableNode.getId(), Relationship.Type.READS_FROM));
      } else if (element.getQualifiedName().equals("insert")) {
        graph.addRelationship(
            new Relationship(
                statementNode.getId(), tableNode.getId(), Relationship.Type.WRITES_TO));
      }
    }
  }

  private List<File> findXMLFiles(Path path) {
    try (Stream<Path> stream = Files.walk(path)) {
      return stream
          .filter(p -> p.toString().endsWith(".xml"))
          .filter(Files::isRegularFile)
          .map(Path::toFile)
          .collect(Collectors.toList());
    } catch (Exception e) {
      throw new RuntimeException("Failed to find XML files in " + path, e);
    }
  }
}
