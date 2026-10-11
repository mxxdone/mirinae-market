package com.mirinae.market.architecture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.mirinae.market.architecture.fixture.negative.modules.backwardbusiness.business.BbService;
import com.mirinae.market.architecture.fixture.negative.modules.backwardbusiness.presentation.BbController;
import com.mirinae.market.architecture.fixture.negative.modules.backwarddata.business.BdService;
import com.mirinae.market.architecture.fixture.negative.modules.backwarddata.data.BdRepository;
import com.mirinae.market.architecture.fixture.negative.modules.classcycle.business.CycleA;
import com.mirinae.market.architecture.fixture.negative.modules.classcycle.business.CycleB;
import com.mirinae.market.architecture.fixture.negative.modules.configref.business.ConfigReferrer;
import com.mirinae.market.architecture.fixture.negative.modules.crossdatacaller.business.CrossDataCaller;
import com.mirinae.market.architecture.fixture.negative.modules.crossdatatarget.data.CrossDataTarget;
import com.mirinae.market.architecture.fixture.negative.modules.crossinternalcaller.business.CrossInternalCaller;
import com.mirinae.market.architecture.fixture.negative.modules.crossinternaltarget.business.internal.CrossInternalTarget;
import com.mirinae.market.architecture.fixture.negative.modules.cyclea.business.ModuleCycleA;
import com.mirinae.market.architecture.fixture.negative.modules.cycleb.business.ModuleCycleB;
import com.mirinae.market.architecture.fixture.negative.modules.dataleak.business.FullyQualifiedJdbcLeak;
import com.mirinae.market.architecture.fixture.negative.modules.dataleak.business.IndirectJdbcLeak;
import com.mirinae.market.architecture.fixture.negative.modules.dataleak.business.StaticImportJdbcLeak;
import com.mirinae.market.architecture.fixture.negative.modules.entrypoint.business.EntryPointReferrer;
import com.mirinae.market.architecture.fixture.negative.modules.sdkleak.business.HttpClientLeak;
import com.mirinae.market.architecture.fixture.negative.modules.web.business.ServletLeakingService;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * 아키텍처 규칙을 생산 코드와 양성·음성 fixture에 적용해 검출 여부를 검증한다. 음성 시나리오는 규칙별로 개별 검증하여 집계 실패가 개별 미검출을 가리지 않게 한다.
 */
class StructureRulesTest {

  private static final List<ArchRule> RULES =
      List.of(
          ArchitectureRules.moduleBoundaries(),
          ArchitectureRules.integrationTypesOnlyInData(),
          ArchitectureRules.webTypesNotInBusiness(),
          ArchitectureRules.noReverseReferenceToApplicationEntryPoint(),
          ArchitectureRules.modulesMustNotReferenceCompositionRootConfig(),
          ArchitectureRules.noModuleCycles(),
          ArchitectureRules.noClassCycles());

  @Test
  void productionCodeFollowsAllArchitectureRules() {
    JavaClasses classes =
        new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.mirinae.market");

    assertThat(classes).isNotEmpty();
    assertAllRulesPass(classes);
  }

  @Test
  void positiveFixturesSatisfyAllArchitectureRules() {
    JavaClasses classes =
        new ClassFileImporter().importPackages("com.mirinae.market.architecture.fixture.positive");

    assertThat(classes).isNotEmpty();
    assertAllRulesPass(classes);
  }

  @Test
  void presentationToDataLayerSkippingIsDetected() {
    assertRuleFails(
        ArchitectureRules.moduleBoundaries(),
        importPackages("com.mirinae.market.architecture.fixture.negative.modules.skipping"));
  }

  @Test
  void businessToPresentationBackwardDependencyIsDetected() {
    assertRuleFails(
        ArchitectureRules.moduleBoundaries(), importClasses(BbController.class, BbService.class));
  }

  @Test
  void dataToBusinessBackwardDependencyIsDetected() {
    assertRuleFails(
        ArchitectureRules.moduleBoundaries(), importClasses(BdService.class, BdRepository.class));
  }

  @Test
  void crossModuleInternalBusinessAccessIsDetected() {
    assertRuleFails(
        ArchitectureRules.moduleBoundaries(),
        importClasses(CrossInternalCaller.class, CrossInternalTarget.class));
  }

  @Test
  void crossModuleDataAccessIsDetected() {
    assertRuleFails(
        ArchitectureRules.moduleBoundaries(),
        importClasses(CrossDataCaller.class, CrossDataTarget.class));
  }

  @Test
  void unknownModuleLayerIsDetected() {
    assertRuleFails(
        ArchitectureRules.moduleBoundaries(),
        importPackages("com.mirinae.market.architecture.fixture.negative.modules.unknownlayer"));
  }

  @Test
  void classCycleIsDetected() {
    assertRuleFails(ArchitectureRules.noClassCycles(), importClasses(CycleA.class, CycleB.class));
  }

  @Test
  void moduleCycleIsDetected() {
    assertRuleFails(
        ArchitectureRules.noModuleCycles(), importClasses(ModuleCycleA.class, ModuleCycleB.class));
  }

  @Test
  void fullyQualifiedJdbcReferenceIsDetected() {
    assertRuleFails(
        ArchitectureRules.integrationTypesOnlyInData(),
        importClasses(FullyQualifiedJdbcLeak.class));
  }

  @Test
  void staticImportJdbcReferenceIsDetected() {
    assertRuleFails(
        ArchitectureRules.integrationTypesOnlyInData(), importClasses(StaticImportJdbcLeak.class));
  }

  @Test
  void indirectJdbcReferenceIsDetected() {
    assertRuleFails(
        ArchitectureRules.integrationTypesOnlyInData(), importClasses(IndirectJdbcLeak.class));
  }

  @Test
  void jdkHttpClientReferenceIsDetected() {
    assertRuleFails(
        ArchitectureRules.integrationTypesOnlyInData(), importClasses(HttpClientLeak.class));
  }

  @Test
  void webTypeInBusinessIsDetected() {
    assertRuleFails(
        ArchitectureRules.webTypesNotInBusiness(), importClasses(ServletLeakingService.class));
  }

  @Test
  void applicationEntryPointReverseReferenceIsDetected() {
    assertRuleFails(
        ArchitectureRules.noReverseReferenceToApplicationEntryPoint(),
        importClasses(EntryPointReferrer.class));
  }

  @Test
  void compositionRootConfigReverseReferenceIsDetected() {
    assertRuleFails(
        ArchitectureRules.modulesMustNotReferenceCompositionRootConfig(),
        importClasses(ConfigReferrer.class));
  }

  private static JavaClasses importPackages(String... packages) {
    return new ClassFileImporter().importPackages(packages);
  }

  private static JavaClasses importClasses(Class<?>... classes) {
    return new ClassFileImporter().importClasses(classes);
  }

  private static void assertAllRulesPass(JavaClasses classes) {
    for (ArchRule rule : RULES) {
      assertThatCode(() -> rule.check(classes))
          .as("규칙 통과: %s", rule.getDescription())
          .doesNotThrowAnyException();
    }
  }

  private static void assertRuleFails(ArchRule rule, JavaClasses classes) {
    assertThat(classes).isNotEmpty();
    assertThatThrownBy(() -> rule.check(classes))
        .as("규칙 검출: %s", rule.getDescription())
        .isInstanceOf(AssertionError.class);
  }
}
