# 개발 규칙

## Architecture
- 서버 업무: feature modules + 3-Layer, Presentation(입출력) → Business(업무 규칙) → Data(영속성·외부 연동).
- UI·배치·워크플로: 확정된 구조·허용 의존성 준수; 임의 완화 금지.
- 3계층: Layer skipping·역방향 의존 금지; DB/ORM/외부 SDK는 Data 격리. 모듈 간 호출은 Business → 공개 Business 진입점만 허용. 순환 의존 전면 금지.
- Composition Root: 기존 진입점 우선; 필요 시에만 bootstrap 분리. 업무 로직·계층 코드의 역참조 금지.
- 일반 데이터 타입으로 계층 간 전달; DTO/Mapper는 변환 필요 시만. ORM/HTTP/SDK 타입 누출·클라이언트의 서버 코드/비밀값 참조 금지.
- SRP·KISS·YAGNI·Ubiquitous Language 준수. 업무 규칙 단일화; 성급한 DRY·추상화 금지. 전술적 DDD·나머지 SOLID는 필요 시만. 범용 기반 클래스·추가 계층·미사용 파일 선제 생성 금지.
- 스키마·트랜잭션·인증/인가·서비스 계약·동시성/재시도 정책 변경 전 영향·호환성·실패 처리 검토.
- 확정 설계는 새 근거 없이 재검토하지 않음. 모순·결함 발견 시 근거·영향·수정안 제시; 범위·계약 변경 사전 확인. 아키텍처 변경은 트레이드오프 검토 후 ADR·의존성 검사 갱신.

## Implementation & Verification
- Spec 범위 내 Vertical Slice 구현. 초기 설정·기획 반복 금지. 프로젝트 지정 검사 명령·gate 사용.

| 시점 | 필수 검증 |
|---|---|
| Spec 작성·변경 | 핵심 정상·실패 시나리오, Given–When–Then AC |
| 업무 규칙 구현 | Unit·TDD: 기대값 테스트 → 실패 확인 → 구현 → 통과; 정상·실패·경계값 |
| DB·API 연결 | Integration: 저장·조회·인가·트랜잭션 등 해당 경계 |
| 사용자 흐름 완성 | 핵심 E2E: 자체 백엔드 포함; 백엔드 없는 제품은 실제 구성 범위 |
| 기능 완료·병합 | 최종 변경에 유효한 필수 gate·Regression·Review |
| 배포 전후 | Preview·복구 절차 → 배포 후 Smoke·Monitoring; DB 변경은 데이터 복구 포함 |

- TDD는 핵심 규칙만; 모든 함수에 강제 금지. UI 문구·스타일에 업무 Unit 신설, 모든 예외의 E2E 중복 금지.
- 버그 수정: Regression 추가. Mock 범위 명시; 실제 연동 검증과 구분.
- 증거: 대상 변경본·명령·실제 결과. 동일 코드/설정/환경의 유효한 통과 결과 재사용; 변경·실패·증거 부족 시 영향 범위 재검증. 완료 시 미충족 필수 검사 보완. CI는 로컬 검증과 별도.
- 공통 코드 변경은 의존 기능까지 검증. 테스트 삭제·skip·검사 완화로 통과 금지.
- 구조/검사 설정 변경 시 관련 gate·차단 확인; 의도적 위반 실험은 검사 설정 변경 때만 반복. 억제·예외 사유 기록; 미설정·미실행 필수 검사는 통과 아님.

## Git Workflow

- 기능 개발은 짧은 기능 브랜치에서 진행한다. PR의 필수 CI 통과와 리뷰 후 main에 병합한다. 사용자가 main 직접 작업을 명시한 경우 해당 지시를 따른다.

## Review
- 대상: diff·영향 범위. 고위험 변경: 실패 시나리오·누락 테스트 집중 검증.
- Correctness: AC 충족·회귀 없음.
- Architecture: Layer Boundary·Dependency Direction·SRP.
- Simplicity: KISS·YAGNI·업무 규칙 중복/불필요한 추상화 없음.
- Verification: 최종 변경의 필수 gate 통과·우회 없음.
- Acceptance Evidence: 핵심 흐름·기대값 대비 결과·미검증 항목.
- 결함: `심각도 | 파일:위치 | 발생 조건·영향 | 근거·수정 필요성`. 취향·미확인 가설과 구분.
- 기준 위반 결함·필수 검사 미통과는 완료 차단. 사람의 수용 확인은 기능 단위.

## Documents
- 기본 참조: 본 지침·관련 Spec. 의미 변경 시만 갱신.
- Spec: 목적·범위·도메인 용어·업무 규칙·예외·Given–When–Then AC. 요구사항 변경 시 테스트 동기화. 개발 운영 규칙 제외.
- PLAN.md: 여러 세션의 큰 작업에만 생성. 남은 일·차단 요인·다음 행동; 완료·중단·재개 시 갱신.
- ADR.md: 중요 설계 결정 시 생성, 단일 파일 누적. 사소한 구현 선택 제외.
  형식: ID·날짜·제목 / 상태 / 맥락·제약 / 대안 / 결정·이유 / 단점·재검토 조건.
  기존 기록 보존·대체 결정 연결; 관련 설계 변경 시 해당 항목만 참조.
- SSOT: 코드/설정 설명 복제 금지; 의도·제약·결정 이유 기록. Spec↔ADR, PLAN↔이슈 중복 금지; 연결로 대체.
- README·운영 문서: 실행·인수인계·복구에 필요 시만 생성·참조. 빈 문서 선제 생성 금지.
- 지속 규칙은 본 지침·프로젝트 설정에 유지. 공통 시작 문서의 반복 로딩·복사 금지.

## 프로젝트 참조와 작성 언어
- 제품 요구사항은 `docs/SPEC.md`, 구현 순서·진행 상태는 `PLAN.md`, 용어는 `CONTEXT.md`, 중요한 결정은 `ADR.md`를 참조한다.
- 코드 주석·Javadoc과 작성하는 API 설명은 한국어로 작성한다. 의도·제약·주의점 등 설명이 필요한 경우에만 주석을 추가한다.
- API 문서는 springdoc-openapi의 OpenAPI 명세와 Swagger UI로 제공한다. API 변경 시 요청·응답·실패 계약 설명을 동기화한다.

## 백엔드 빌드·검사 구성 (Phase 1~2)

- 스택: Java 21 toolchain, Spring Boot 4.1.1, Gradle Wrapper 9.7.1, springdoc-openapi 3.1.1. 시스템 Gradle 없이 Wrapper만 사용한다.
- 저장소 루트가 백엔드 프로젝트다. 서버 패키지 루트는 `com.mirinae.market`, 진입점과 `config`는 composition root, 향후 기능은 `modules.<feature>.presentation|business|data`에 둔다.
- 검사 명령: Windows `.\gradlew.bat check`, Linux `bash ./gradlew check`. CI는 Wrapper 실행 권한 설정 후 `./gradlew check build`를 실행한다. 실행 가능한 jar는 `.\gradlew.bat build`로 `build/libs/*.jar`에 생성한다. 실패 무시·기본 skip 플래그를 추가하지 않는다.
- gate 연결: `check` = Spotless(`spotlessCheck`) + 컴파일(`-Xlint:all -Werror`) + PMD(`pmdMain`,`pmdTest`) + 테스트(JUnit·ArchUnit).
- 형식: Spotless googleJavaFormat 1.28.0. 1.37.0은 JDK 21에서 `jdk.compiler/com.sun.tools.javac.util` export 부재로 실행되지 않아 선택하지 않는다.
- lint: PMD 7.28.0 공식 CLI를 JavaExec로 실행하고 규칙은 `config/pmd/pmd-ruleset.xml`에 둔다. 범위는 미사용 코드·오류 가능성·동시성으로 한정한다. Gradle 기본 PMD 연동은 잘못된 ruleset을 성공 처리할 수 있어 사용하지 않는다.
  - 동시성은 `category/java/multithreading.xml` 전체를, 오류 가능성은 `errorprone`에서 항목을 선택한다.
  - ArchUnit fixture(`architecture/fixture`)는 구조 위반을 의도적으로 담으므로 PMD에서 제외한다(규칙: `.*[\\/]architecture[\\/]fixture[\\/].*`).
- 아키텍처(ArchUnit): `ArchitectureRules`의 규칙을 `StructureRulesTest`에서 생산 코드와 양성·음성 fixture에 적용한다. 규칙은 같은 기능 내 Presentation→Business→Data, 기능 간 Business 공개 진입점만 허용, 계층 밖 기능 패키지 거부, DB/ORM·외부 연동 SDK의 Data 격리, Business의 HTTP/Servlet 금지, 모듈·클래스 순환 금지, 진입점·`config` 역참조 금지다.
  - 기능 간 공개 Business 진입점은 `modules.<feature>.business` 바로 아래 public 타입이다.
  - Data 밖 금지 타입: `java.sql`, `javax.sql`, `jakarta.persistence`, `org.hibernate`, `org.springframework.jdbc/orm/data`, `java.net.http`, `org.apache.http`, `okhttp3`, `com.squareup.okhttp3`. 새 외부 SDK를 도입하면 이 목록을 갱신한다.
  - Phase 2의 계정·매장 생산 모듈 도입 후 `allowEmptyShould(true)` 예외를 제거한다. 생산 규칙의 빈 선택자는 실패하며 양성·음성 fixture 검출을 유지한다.
- 테스트 예외: 동시 중복 가입을 검증하는 `AccountHttpFlowTest.concurrentDuplicateIdOrEmailPersistsOnlyOneAccount`에만 `PMD.DoNotUseThreads`를 억제한다. 웹 컨테이너 밖 테스트 클라이언트의 병렬 실행을 위한 것으로, executor를 종료하고 생산 코드의 동시성 규칙은 유지한다.
- 예외: `gradlew`·`gradlew.bat`·`gradle-wrapper.jar`는 Gradle이 생성한 upstream 산출물이므로 한국어 주석 규칙 적용 대상에서 제외한다.
- Phase 2: PostgreSQL·Flyway·JPA와 세션 인증을 구성한다. `check`의 HTTP·DB integration은 Docker 엔진과 Testcontainers PostgreSQL을 사용하며 환경 실패 시 skip하지 않는다. 프런트엔드·Playwright는 별도 작업이다. 원격 CI의 실행 결과는 GitHub Actions를 참조하며 로컬 검증과 구분한다. `.local/`은 로컬 캐시·증거 경로로 Git에서 제외한다.

## 프런트엔드 빌드·검사 구성 (Phase 1~2)

- `frontend/`는 Node.js 24·React·TypeScript strict·Vite·npm lockfile을 사용한다. 설치는 `npm ci`, 개발은 `npm run dev`, 필수 정적·단위 gate는 `npm run check`, 배포 번들은 `npm run build`다.
- `src/main.tsx`는 composition root다. `src/ui/`는 `src/api/`의 공개 HTTP 함수와 일반 타입을 사용한다. HTTP·쿠키·CSRF 처리는 `src/api/`에 격리한다. `src/validation/`는 입력 규칙을 검증하며 UI를 참조하지 않는다. API의 UI 역참조·서버 코드 참조·소스 순환은 금지한다.
- `check`에는 TypeScript·ESLint 미사용/도달 불가/미처리 Promise·Prettier·dependency-cruiser 경계/순환 검사·Vitest를 연결한다. 상대 경로와 별칭·재수출로 경계를 우회하지 않는다. 생산 코드에서 API 밖의 직접 HTTP 호출은 허용하지 않는다.
- 첫 가입 흐름의 핵심 E2E는 `npm run test:e2e`로 실제 PostgreSQL·자체 백엔드·Vite·Playwright를 포함한다. 로컬은 설치된 Edge를 선택할 수 있으며 CI는 Chromium을 사용한다. 준비 방법과 환경 변수는 README를 참조한다. 미설정 계정이나 환경 실패를 skip하지 않는다.
- 브라우저 저장소에 비밀번호·세션·CSRF 토큰을 저장하지 않는다. 가입 완료는 자동 로그인하지 않으며 세션 만료·로그아웃 성공 시 개인/매장 상태를 폐기한다. 전송 실패를 성공으로 안내하지 않는다.
- `.github/workflows/frontend.yml`은 정적 gate·빌드와 실제 백엔드를 포함한 E2E를 정의한다. 로컬 통과와 미실행 원격 CI를 구분하며 CI 테스트 계정은 GitHub Secrets에서 받는다. 검사 구성 변경은 정상 통과와 의도적 위반의 실제 차단을 확인한다.
