package reengineering.ddd.knowledgegraph.extractor.infrastructure;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import java.io.File;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import reengineering.ddd.knowledgegraph.extractor.BaseExtractor;
import reengineering.ddd.knowledgegraph.model.*;

public class InfrastructureLayerExtractor extends BaseExtractor {

  public InfrastructureLayerExtractor(Graph graph) {
    super(graph);
  }

  @Override
  public void extract(Path basePath) {
    Path mapperPath = basePath.resolve("libs/backend/persistent/mybatis/src/main/java");
    List<File> javaFiles = findJavaFiles(mapperPath);

    for (File file : javaFiles) {
      CompilationUnit cu = parseFile(file);
      String filePath = getFilePath(file);
      new InfrastructureVisitor(filePath).visit(cu, null);
    }

    Path persistentPath = basePath.resolve("libs/backend/persistent/mybatis/src/main/java");
    List<File> allPersistentFiles = findJavaFiles(persistentPath);

    for (File file : allPersistentFiles) {
      CompilationUnit cu = parseFile(file);
      String filePath = getFilePath(file);
      new AssociationVisitor(filePath).visit(cu, null);
    }
  }

  private class InfrastructureVisitor extends VoidVisitorAdapter<Void> {
    private final String filePath;

    public InfrastructureVisitor(String filePath) {
      this.filePath = filePath;
    }

    @Override
    public void visit(ClassOrInterfaceDeclaration n, Void arg) {
      super.visit(n, arg);

      if (!n.isInterface()) {
        return;
      }

      String className = n.getNameAsString();
      String packageName =
          n.findCompilationUnit()
              .flatMap(cu -> cu.getPackageDeclaration())
              .map(pd -> pd.getNameAsString())
              .orElse("");
      String fullyQualifiedName = packageName + "." + className;

      checkForMyBatisMapper(n, fullyQualifiedName, filePath);
    }

    private void checkForMyBatisMapper(
        ClassOrInterfaceDeclaration n, String fullyQualifiedName, String filePath) {
      if (hasAnnotation(n, "Mapper")) {
        String namespace = fullyQualifiedName;
        MyBatisMapperNode mapperNode =
            new MyBatisMapperNode(fullyQualifiedName, namespace, filePath);
        graph.addNode(mapperNode);

        graph.addRelationship(
            new Relationship(
                mapperNode.getId(),
                "LAYER:" + Layer.INFRASTRUCTURE_LAYER.name(),
                Relationship.Type.BELONGS_TO));

        extractMapperMethods(n, fullyQualifiedName, filePath);
      }
    }

    private void extractMapperMethods(
        ClassOrInterfaceDeclaration n, String className, String filePath) {
      n.getMethods()
          .forEach(
              method -> {
                String methodName = method.getNameAsString();
                String signature = method.getDeclarationAsString(false, false, false);
                String visibility = "public";

                MethodNode methodNode =
                    new MethodNode(className, methodName, signature, visibility, filePath);
                graph.addNode(methodNode);

                graph.addRelationship(
                    new Relationship(
                        "MAPPER:" + className, methodNode.getId(), Relationship.Type.CONTAINS));

                graph.addRelationship(
                    new Relationship(
                        methodNode.getId(),
                        "METHOD:" + className + "." + methodName + "_SQL",
                        Relationship.Type.DEFINES_QUERY));

                if (methodName.contains("insert")) {
                  graph.addRelationship(
                      new Relationship(
                          methodNode.getId(), "TABLE:messages", Relationship.Type.WRITES_TO));
                } else if (methodName.contains("find")) {
                  graph.addRelationship(
                      new Relationship(
                          methodNode.getId(), "TABLE:messages", Relationship.Type.READS_FROM));
                } else if (methodName.contains("count")) {
                  graph.addRelationship(
                      new Relationship(
                          methodNode.getId(), "TABLE:messages", Relationship.Type.OPERATES_ON));
                }
              });
    }

    private boolean hasAnnotation(ClassOrInterfaceDeclaration clazz, String annotationName) {
      return clazz.getAnnotations().stream()
          .anyMatch(a -> a.getNameAsString().equals(annotationName));
    }
  }

  private class AssociationVisitor extends VoidVisitorAdapter<Void> {
    private final String filePath;

    public AssociationVisitor(String filePath) {
      this.filePath = filePath;
    }

    @Override
    public void visit(ClassOrInterfaceDeclaration n, Void arg) {
      super.visit(n, arg);

      if (n.isInterface()) {
        return;
      }

      String className = n.getNameAsString();
      String packageName =
          n.findCompilationUnit()
              .flatMap(cu -> cu.getPackageDeclaration())
              .map(pd -> pd.getNameAsString())
              .orElse("");
      String fullyQualifiedName = packageName + "." + className;

      checkForAssociationImplementation(n, fullyQualifiedName, filePath);
    }

    private void checkForAssociationImplementation(
        ClassOrInterfaceDeclaration n, String fullyQualifiedName, String filePath) {
      Optional<String> implementsInterface =
          n.getImplementedTypes().stream()
              .map(type -> type.getNameAsString())
              .filter(
                  name ->
                      name.contains("Messages")
                          || name.contains("Conversations")
                          || name.contains("Accounts"))
              .findFirst();

      if (implementsInterface.isPresent()) {
        String interfaceName = implementsInterface.get();
        String fullInterfaceName =
            n.findCompilationUnit()
                .flatMap(cu -> cu.getPackageDeclaration())
                .map(pd -> pd.getNameAsString() + "." + interfaceName)
                .orElse(interfaceName);

        AssociationImplementationNode assocNode =
            new AssociationImplementationNode(fullyQualifiedName, fullInterfaceName, filePath);
        graph.addNode(assocNode);

        graph.addRelationship(
            new Relationship(
                assocNode.getId(),
                "LAYER:" + Layer.INFRASTRUCTURE_LAYER.name(),
                Relationship.Type.BELONGS_TO));

        graph.addRelationship(
            new Relationship(
                assocNode.getId(), "INTERFACE:" + fullInterfaceName, Relationship.Type.IMPLEMENTS));

        graph.addRelationship(
            new Relationship(
                "INTERFACE:" + fullInterfaceName,
                assocNode.getId(),
                Relationship.Type.IMPLEMENTED_BY));

        extractAssociationFields(n, fullyQualifiedName);
      }
    }

    private void extractAssociationFields(ClassOrInterfaceDeclaration n, String className) {
      n.getFields()
          .forEach(
              field -> {
                if (hasAnnotation(field, "Inject")) {
                  field
                      .getVariables()
                      .forEach(
                          variable -> {
                            String typeName = variable.getTypeAsString();
                            if (typeName.contains("Mapper")) {
                              String fullyQualifiedMapper = getFullyQualifiedMapper(typeName);

                              graph.addRelationship(
                                  new Relationship(
                                      "ASSOC:" + className,
                                      "MAPPER:" + fullyQualifiedMapper,
                                      Relationship.Type.INJECTS));
                            }
                          });
                }
              });
    }

    private boolean hasAnnotation(FieldDeclaration field, String annotationName) {
      return field.getAnnotations().stream()
          .anyMatch(a -> a.getNameAsString().equals(annotationName));
    }

    private String getFullyQualifiedMapper(String typeName) {
      return "reengineering.ddd.teamai.mybatis.mappers." + typeName;
    }
  }
}
