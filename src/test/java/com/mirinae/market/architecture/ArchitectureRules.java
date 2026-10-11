package com.mirinae.market.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import com.tngtech.archunit.library.dependencies.SliceAssignment;
import com.tngtech.archunit.library.dependencies.SliceIdentifier;
import com.tngtech.archunit.library.dependencies.SlicesRuleDefinition;

/**
 * 백엔드 3계층·모듈 경계·타입 격리 규칙을 ArchUnit으로 정의한다. Phase 1에는 생산 모듈이 없으므로 모듈 관련
 * 선택자(moduleBoundaries·noModuleCycles·noClassCycles·webTypesNotInBusiness)는 생산 코드에서 비어 있고, 전용
 * fixture로 검출을 검증한다.
 */
final class ArchitectureRules {

  /** 애플리케이션 진입점(composition root)의 정규화된 이름이다. */
  static final String APPLICATION_ENTRY_POINT = "com.mirinae.market.MirinaeMarketApplication";

  /** config 패키지도 composition root이므로 기능 모듈이 역참조하지 못한다. */
  static final String COMPOSITION_ROOT_CONFIG_PACKAGE = "com.mirinae.market.config";

  private static final String MODULES_MARKER = ".modules.";

  private ArchitectureRules() {}

  /**
   * 같은 기능 안에서는 Presentation → Business → Data 방향만 허용하고, 기능 간에는 Business가 다른 기능의 공개 Business
   * 진입점(business 패키지 바로 아래 public 타입)만 참조하도록 제한한다. 기능 하위의 알 수 없는 계층 패키지도 위반으로 처리한다.
   */
  static ArchRule moduleBoundaries() {
    return com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes()
        .that()
        .resideInAPackage("..modules..")
        .should(new ModuleBoundariesCondition())
        .allowEmptyShould(true);
  }

  /**
   * Data 밖에서는 JDBC·JPA·Hibernate·Spring Data와 JDK HTTP·외부 연동 SDK 타입을 참조하지 못하게 한다. 연동 SDK를 추가할 때마다 이
   * 목록을 갱신해야 한다.
   */
  static ArchRule integrationTypesOnlyInData() {
    return noClasses()
        .that()
        .resideOutsideOfPackage("..data..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(
            "java.sql..",
            "javax.sql..",
            "jakarta.persistence..",
            "org.hibernate..",
            "org.springframework.jdbc..",
            "org.springframework.orm..",
            "org.springframework.data..",
            "java.net.http..",
            "org.apache.http..",
            "okhttp3..",
            "com.squareup.okhttp3..");
  }

  /** Business 계층에서는 HTTP·Servlet 타입을 참조하지 못하게 한다. */
  static ArchRule webTypesNotInBusiness() {
    return noClasses()
        .that()
        .resideInAPackage("..business..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(
            "jakarta.servlet..", "org.springframework.web..", "org.springframework.http..")
        .allowEmptyShould(true);
  }

  /** 기능·계층 코드가 애플리케이션 진입점을 역참조하지 못하게 한다. */
  static ArchRule noReverseReferenceToApplicationEntryPoint() {
    return noClasses()
        .that()
        .doNotHaveFullyQualifiedName(APPLICATION_ENTRY_POINT)
        .should()
        .dependOnClassesThat()
        .haveFullyQualifiedName(APPLICATION_ENTRY_POINT);
  }

  /** 기능 모듈이 composition root의 config 패키지를 역참조하지 못하게 한다. */
  static ArchRule modulesMustNotReferenceCompositionRootConfig() {
    return noClasses()
        .that()
        .resideInAPackage("..modules..")
        .should()
        .dependOnClassesThat()
        .resideInAPackage(COMPOSITION_ROOT_CONFIG_PACKAGE + "..")
        .allowEmptyShould(true);
  }

  /** 기능 모듈 간 순환 의존을 금지한다. */
  static ArchRule noModuleCycles() {
    return SlicesRuleDefinition.slices()
        .matching("..modules.(*)..")
        .should()
        .beFreeOfCycles()
        .allowEmptyShould(true);
  }

  /** 클래스 간 순환 의존을 금지한다. */
  static ArchRule noClassCycles() {
    SliceAssignment classes =
        new SliceAssignment() {

          @Override
          public SliceIdentifier getIdentifierOf(JavaClass javaClass) {
            return SliceIdentifier.of(javaClass.getName());
          }

          @Override
          public String getDescription() {
            return "각 클래스";
          }
        };
    return SlicesRuleDefinition.slices()
        .assignedFrom(classes)
        .should()
        .beFreeOfCycles()
        .allowEmptyShould(true);
  }

  private static String featureOf(JavaClass javaClass) {
    String packageName = javaClass.getPackageName();
    int index = packageName.indexOf(MODULES_MARKER);
    if (index < 0) {
      return null;
    }
    String rest = packageName.substring(index + MODULES_MARKER.length());
    if (rest.isEmpty()) {
      return null;
    }
    int dot = rest.indexOf('.');
    return dot < 0 ? rest : rest.substring(0, dot);
  }

  private static String layerOf(JavaClass javaClass) {
    String packageName = javaClass.getPackageName();
    int index = packageName.indexOf(MODULES_MARKER);
    if (index < 0) {
      return null;
    }
    String[] parts = packageName.substring(index + MODULES_MARKER.length()).split("\\.");
    if (parts.length < 2) {
      return null;
    }
    return switch (parts[1]) {
      case "presentation", "business", "data" -> parts[1];
      default -> null;
    };
  }

  private static boolean isPublicBusinessEntryPoint(JavaClass target, String feature) {
    String packageName = target.getPackageName();
    int index = packageName.indexOf(MODULES_MARKER);
    if (index < 0) {
      return false;
    }
    String root = packageName.substring(0, index + MODULES_MARKER.length());
    return packageName.equals(root + feature + ".business")
        && target.getModifiers().contains(JavaModifier.PUBLIC);
  }

  /** 기능·계층 경계와 모듈 간 공개 진입점 허용 규칙을 클래스 의존 단위로 검사한다. */
  private static final class ModuleBoundariesCondition extends ArchCondition<JavaClass> {

    ModuleBoundariesCondition() {
      super("기능 간·계층 간 의존 방향을 지킨다");
    }

    @Override
    public void check(JavaClass origin, ConditionEvents events) {
      String originFeature = featureOf(origin);
      if (originFeature == null) {
        return;
      }
      String originLayer = layerOf(origin);
      if (originLayer == null) {
        events.add(
            SimpleConditionEvent.violated(
                origin,
                origin.getName()
                    + " 는 modules."
                    + originFeature
                    + " 아래 presentation·business·data 계층에 속하지 않는다"));
        return;
      }
      for (Dependency dependency : origin.getDirectDependenciesFromSelf()) {
        JavaClass target = dependency.getTargetClass();
        String targetFeature = featureOf(target);
        String targetLayer = layerOf(target);
        if (targetFeature == null || targetLayer == null) {
          continue;
        }
        if (!isAllowed(originFeature, originLayer, targetFeature, targetLayer, target)) {
          events.add(SimpleConditionEvent.violated(origin, dependency.getDescription()));
        }
      }
    }

    private static boolean isAllowed(
        String originFeature,
        String originLayer,
        String targetFeature,
        String targetLayer,
        JavaClass target) {
      boolean sameFeature = originFeature.equals(targetFeature);
      return switch (targetLayer) {
        case "data" ->
            sameFeature && (originLayer.equals("business") || originLayer.equals("data"));
        case "business" ->
            sameFeature
                ? (originLayer.equals("presentation") || originLayer.equals("business"))
                : originLayer.equals("business")
                    && isPublicBusinessEntryPoint(target, targetFeature);
        case "presentation" -> sameFeature && originLayer.equals("presentation");
        default -> false;
      };
    }
  }
}
