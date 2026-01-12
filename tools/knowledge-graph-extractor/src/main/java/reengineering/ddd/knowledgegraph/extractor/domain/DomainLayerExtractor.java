package reengineering.ddd.knowledgegraph.extractor.domain;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import java.io.File;
import java.nio.file.Path;
import java.util.List;
import reengineering.ddd.knowledgegraph.extractor.BaseExtractor;
import reengineering.ddd.knowledgegraph.model.*;

public class DomainLayerExtractor extends BaseExtractor {

  public DomainLayerExtractor(Graph graph) {
    super(graph);
  }

  @Override
  public void extract(Path basePath) {
    Path domainPath = basePath.resolve("libs/backend/domain/src/main/java");
    List<File> javaFiles = findJavaFiles(domainPath);

    for (File file : javaFiles) {
      CompilationUnit cu = parseFile(file);
      new DomainVisitor().visit(cu, null);
    }
  }

  private class DomainVisitor extends VoidVisitorAdapter<Void> {
    @Override
    public void visit(ClassOrInterfaceDeclaration n, Void arg) {
      super.visit(n, arg);

      String className = n.getNameAsString();
      String packageName =
          n.findCompilationUnit()
              .flatMap(cu -> cu.getPackageDeclaration())
              .map(pd -> pd.getNameAsString())
              .orElse("");
      String fullyQualifiedName = packageName + "." + className;

      checkForEntity(n, fullyQualifiedName);
      checkForDTO(n, fullyQualifiedName);
      checkForAssociationInterface(n, fullyQualifiedName);
      checkForExternalService(n, fullyQualifiedName);
    }

    private void checkForEntity(ClassOrInterfaceDeclaration n, String fullyQualifiedName) {
      boolean isEntity =
          n.getImplementedTypes().stream()
              .map(type -> type.getNameAsString())
              .anyMatch(name -> name.equals("Entity"));

      if (isEntity) {
        EntityNode entityNode = new EntityNode(fullyQualifiedName, Layer.DOMAIN_LAYER);
        graph.addNode(entityNode);

        graph.addRelationship(
            new Relationship(
                entityNode.getId(),
                "LAYER:" + Layer.DOMAIN_LAYER.name(),
                Relationship.Type.BELONGS_TO));

        extractEntityInterfaces(n, fullyQualifiedName);
        extractMethods(n, fullyQualifiedName);
      }
    }

    private void extractEntityInterfaces(ClassOrInterfaceDeclaration n, String className) {
      n.getMembers().stream()
          .filter(member -> member.isClassOrInterfaceDeclaration())
          .map(member -> (ClassOrInterfaceDeclaration) member)
          .filter(inner -> inner.isInterface())
          .forEach(
              inner -> {
                String interfaceName = className + "." + inner.getNameAsString();

                DomainInterfaceNode interfaceNode =
                    new DomainInterfaceNode(interfaceName, "Association");
                graph.addNode(interfaceNode);

                graph.addRelationship(
                    new Relationship(
                        "ENTITY:" + className, interfaceNode.getId(), Relationship.Type.CONTAINS));

                checkForHasManyExtension(inner, interfaceNode);
              });
    }

    private void checkForHasManyExtension(
        ClassOrInterfaceDeclaration n, DomainInterfaceNode interfaceNode) {
      n.getExtendedTypes().stream()
          .map(type -> type.getNameAsString())
          .filter(name -> name.equals("HasMany"))
          .findFirst()
          .ifPresent(
              name -> {
                graph.addRelationship(
                    new Relationship(
                        interfaceNode.getId(), "INTERFACE:HasMany", Relationship.Type.EXTENDS));
              });
    }

    private void extractMethods(ClassOrInterfaceDeclaration n, String className) {
      n.getMethods()
          .forEach(
              method -> {
                String methodName = method.getNameAsString();
                String signature = method.getDeclarationAsString(false, false, false);
                String visibility =
                    method.getModifiers().stream()
                            .anyMatch(m -> m.getKeyword().asString().equals("public"))
                        ? "public"
                        : "private";

                MethodNode methodNode =
                    new MethodNode(className, methodName, signature, visibility);
                graph.addNode(methodNode);

                graph.addRelationship(
                    new Relationship(
                        "ENTITY:" + className, methodNode.getId(), Relationship.Type.CONTAINS));

                if (methodName.equals("messages")
                    || methodName.equals("conversations")
                    || methodName.equals("accounts")) {
                  graph.addRelationship(
                      new Relationship(
                          methodNode.getId(),
                          "INTERFACE:" + className + "." + capitalize(methodName),
                          Relationship.Type.EXPOSES_AS));
                }
              });
    }

    private void checkForDTO(ClassOrInterfaceDeclaration n, String fullyQualifiedName) {
      if (n.isRecordDeclaration()
          || n.getAnnotations().stream().anyMatch(a -> a.getNameAsString().equals("Record"))) {
        DTONode dtoNode = new DTONode(fullyQualifiedName);
        graph.addNode(dtoNode);

        graph.addRelationship(
            new Relationship(
                dtoNode.getId(),
                "LAYER:" + Layer.DOMAIN_LAYER.name(),
                Relationship.Type.BELONGS_TO));
      }
    }

    private void checkForAssociationInterface(
        ClassOrInterfaceDeclaration n, String fullyQualifiedName) {
      if (n.isInterface()) {
        boolean extendsHasMany =
            n.getExtendedTypes().stream()
                .map(type -> type.getNameAsString())
                .anyMatch(name -> name.equals("HasMany"));

        if (extendsHasMany) {
          DomainInterfaceNode interfaceNode =
              new DomainInterfaceNode(fullyQualifiedName, "Association");
          graph.addNode(interfaceNode);

          graph.addRelationship(
              new Relationship(
                  interfaceNode.getId(),
                  "LAYER:" + Layer.DOMAIN_LAYER.name(),
                  Relationship.Type.BELONGS_TO));

          graph.addRelationship(
              new Relationship(
                  interfaceNode.getId(), "INTERFACE:HasMany", Relationship.Type.EXTENDS));
        }
      }
    }

    private void checkForExternalService(ClassOrInterfaceDeclaration n, String fullyQualifiedName) {
      if (n.isInterface()) {
        String name = n.getNameAsString();
        if (name.contains("Provider") || name.contains("Service")) {
          ExternalServiceNode serviceNode = new ExternalServiceNode(fullyQualifiedName);
          graph.addNode(serviceNode);

          graph.addRelationship(
              new Relationship(
                  serviceNode.getId(),
                  "LAYER:" + Layer.DOMAIN_LAYER.name(),
                  Relationship.Type.BELONGS_TO));
        }
      }
    }

    private String capitalize(String str) {
      if (str == null || str.isEmpty()) {
        return str;
      }
      return str.substring(0, 1).toUpperCase() + str.substring(1);
    }
  }
}
