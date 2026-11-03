# Phase 7 시연·복구 실행 안내

새 환경에서 미리내 마켓의 핵심 흐름을 다시 준비하고 시연하는 절차다. 시장·매장·판매자 준비부터 상품 등록·당일 판매, 구매자의 검색·모의 결제·모의 결제 내역서 조회·인쇄, 판매자의 수령 처리와 대시보드 확인까지 재현하고, 같은 데이터를 백업·별도 DB로 복원해 이어서 사용하는 방법을 다룬다. 제품 계약은 [Spec의 관리자 운영·결제 내역서 추가 계약](../SPEC.md#관리자-운영결제-내역서-추가-계약), 결정 이유는 [ADR](ADR.md), 일반 실행·검사 방법은 [README](../README.md)를 따른다.

이 문서의 명령은 **시연 전용으로 분리한 새 PostgreSQL 컨테이너**를 대상으로 한다. 기존 개발·수동 테스트 DB와 데이터는 건드리지 않는다. 아래 절차는 저장소에서 직접 실행·검증한 기록이 아니라 시연 준비를 재현하기 위한 안내다. 이번 브랜치에서 실제로 수행한 검증과 그 한계는 `.local/verification/`의 Phase 7 기록에 둔다.

## 1. 준비물과 분리 원칙

- JDK 21, Docker 엔진(리눅스 컨테이너), Node.js 24·npm.
- 시연 DB는 기존 `compose.yaml`의 `postgres`(5432)와 별도 컨테이너·볼륨·포트를 사용한다. 아래 예시는 컨테이너 `mirinae-demo`, 볼륨 `mirinae-demo-data`, 포트 `127.0.0.1:55438`이다.
- 비밀번호는 로컬 시연 전용 예시다. 운영·공개 환경에 재사용하지 않는다.
- 기존 DB의 초기화·삭제·덮어쓰기를 이 절차에 포함하지 않는다.

```powershell
docker run --name mirinae-demo `
  --mount source=mirinae-demo-data,target=/var/lib/postgresql/data `
  -e POSTGRES_DB=mirinae_demo `
  -e POSTGRES_USER=mirinae_demo `
  -e POSTGRES_PASSWORD=mirinae-demo-local `
  -p 127.0.0.1:55438:5432 `
  -d postgres:17.10

docker exec mirinae-demo pg_isready -U mirinae_demo -d mirinae_demo
```

DB 접속 환경변수는 아래 값을 사용한다. 새 터미널마다 다시 지정한다.

```powershell
$demoDbName = 'mirinae_demo'
$env:DB_URL = "jdbc:postgresql://127.0.0.1:55438/$demoDbName"
$env:DB_USERNAME = 'mirinae_demo'
$env:DB_PASSWORD = 'mirinae-demo-local'
```

## 2. 빌드와 첫 기동

Gradle Wrapper만 사용한다. 검사와 실행 가능한 jar 생성을 함께 수행한다.

```powershell
.\gradlew.bat check build
```

첫 기동은 관리자 1명 생성과 데모 계정·시장·매장 초기화를 함께 수행한다. `ADMIN_BOOTSTRAP_*`는 **이 첫 기동에만** 프로세스 환경으로 입력하고, 생성 후에는 변수를 지우거나 `ADMIN_BOOTSTRAP_ENABLED`를 끈 상태로 재기동한다. 공개 관리자 가입·관리자 추가 화면은 없다.

```powershell
$env:ADMIN_BOOTSTRAP_ENABLED = 'true'
$env:ADMIN_BOOTSTRAP_LOGIN_ID = 'demo_admin'
$env:ADMIN_BOOTSTRAP_PASSWORD = 'Admin1234!'
$env:ADMIN_BOOTSTRAP_EMAIL = 'demo-admin@example.com'

.\gradlew.bat bootRun --args='--spring.profiles.active=demo'
```

- 관리자는 같은 ID가 이미 있으면 재기동으로 비밀번호·이메일을 덮어쓰지 않는다. 다른 역할의 ID나 다른 관리자가 이미 있으면 기동이 실패한다.
- `demo` 프로필은 `demo_buyer`, `demo_seller_a`, `demo_seller_b`와 두 시장·매장을 생성한다. 재기동해도 중복 생성하지 않으며, 기존 계정·이름이 초기값과 충돌하면 해당 데이터를 바꾸지 않고 기동을 실패시킨다. 프로필을 끄는 것은 데이터 삭제가 아니다. 계정·비밀번호는 [README의 데모](../README.md#데모)를 참조한다.
- 초기 기동 후 아래처럼 bootstrap 변수를 해제하고 다시 실행한다.

```powershell
$env:ADMIN_BOOTSTRAP_ENABLED = 'false'
Remove-Item Env:ADMIN_BOOTSTRAP_PASSWORD
Remove-Item Env:ADMIN_BOOTSTRAP_EMAIL
Remove-Item Env:ADMIN_BOOTSTRAP_LOGIN_ID
```

Flyway가 스키마를 생성하고 Hibernate는 검증만 수행한다. 첫 기동 로그에서 마이그레이션 성공과 `Started`를 확인하고 `http://localhost:8080/actuator/health`가 `UP`인지 확인한다.

서버를 계속 띄운 채 소스를 다시 빌드할 때는 실행 중인 jar를 덮어쓰지 않는다. jar를 별도 경로로 복사해 그 사본으로 재시작한다.

```powershell
New-Item -ItemType Directory -Force .local\demo | Out-Null
Copy-Item build\libs\mirinae-market-0.0.1-SNAPSHOT.jar .local\demo\mirinae-demo.jar -Force
java -jar .local\demo\mirinae-demo.jar
```

## 3. 화면 연결

프런트는 별도 터미널에서 실행하고 `BACKEND_URL`을 시연 백엔드로 지정한다. Vite를 다시 시작해야 반영된다.

```powershell
cd frontend
npm ci
$env:BACKEND_URL = 'http://127.0.0.1:8080'
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

화면 주소는 `http://127.0.0.1:5175`다. `/api`·`/actuator`는 Vite가 백엔드로 전달한다. 인증 정보는 브라우저 저장소에 두지 않는다.

**초기 생성과 일반 시연의 분리**: `demo`는 첫 계정·시장·매장 생성에만 사용하고 이후에는 기본 프로필로 실행한다. 초기 정보를 관리 화면에서 수정한 뒤 `demo`를 다시 켜면 충돌할 수 있다. 기본 프로필도 실제 한국 시간으로 동작한다. 자동 E2E는 `demo,e2e` 프로필과 `--e2e.fixed-instant=...`로 서버·브라우저 시간을 고정하며 별도 테스트 DB를 쓴다([README의 브라우저 연동 검증](../README.md#브라우저-연동-검증)). 시연용 DB·서버에 고정 시각 프로필을 섞지 않는다.

## 4. 시연 순서

1. **준비(관리자 또는 데모 계정)**: 관리자로 시장·매장·판매자를 준비하거나, 이미 초기화된 `demo_seller_a`·`demo_seller_b`·`demo_buyer`를 사용한다. 관리자 등록 시 판매자는 첫 로그인 후 본인 비밀번호로 변경해야 판매 업무를 사용할 수 있다.
2. **오늘 판매 등록(판매자)**: 상품을 등록하고 오늘 판매 표에서 공통 주문 마감·수령 시작·수령 마감, 가격, 온라인 수량을 **한 번에 적용**한다. 한국 시간 기준 오늘이며 `현재 시각 < 주문 마감 ≤ 수령 시작 < 수령 마감`이어야 한다. 주문 마감이 이미 지났다면 오늘은 공개할 수 없으므로, 다음 시연일에 당일 판매로 다시 준비한다(예약 판매는 이번 범위가 아니다). 오늘 판매 중단·재공개는 같은 표에서 상품별 판매 여부 지정으로 수행한다.
3. **검색·결제(구매자)**: 시장을 선택해 상품을 검색하고 장바구니에 담은 뒤 통합 모의 결제를 실행한다. 확정 결과에서 통합 주문 번호·총액·매장별 상품·수령 시간을 확인한다. 실제 금액은 청구하지 않는다.
4. **모의 결제 내역서(구매자)**: 주문 내역에서 본인의 확정 주문에 대해 모의 결제 내역서를 열고 인쇄한다. 상품·수량·단가·총액·결제 시각과 **조회 시점의** 취소·환불 상태를 확인한다. 이 내역서는 실제 청구나 공식·세무 증빙이 아니며 카드 승인번호·현금영수증 발급번호를 제공하지 않는다. 화면·인쇄는 Phase 7 프런트 구현 범위이고, API 계약은 아래 5절과 Swagger UI를 참조한다.
5. **수령·대시보드(판매자)**: 수령 시작 이후 수령 코드로 수령 처리하고, 대시보드를 새로고침해 준비·수령·취소·환불 현황과 금액이 원본과 일치하는지 확인한다. 수령 가능 시간 경계를 지킨다.

### 재현할 예외 흐름

- **일괄 적용 전체 미적용**: 한 행의 가격·수량·시간이 잘못되면 통합 표 전체가 저장되지 않고 오류 행이 표시되는지 확인한다.
- **판매 중단·재공개**: 중단 시 구매자 검색에서 빠지고 기존 주문·기록은 유지되는지, 재공개 시 같은 판매 제안이 다시 노출되는지 확인한다.
- **가격 변경 재확인**: 장바구니 담은 뒤 판매자가 가격을 바꾸면 결제가 `CONDITIONS_CHANGED`로 실패하고, 구매자가 변경 조건을 재확인해야 진행되는지 확인한다.
- **품절 충돌**: 마지막 수량을 두 구매자가 동시에 결제하면 한 건만 확정되고 나머지는 품절 실패하며 재고가 음수가 되지 않는지 확인한다.
- **판매 실패·부분/전체 환불**: 판매 실패 등록 후 해당 상품 취소·모의 환불이 별도 상태로 보이고, 부분 환불과 전체 환불 금액이 원결제 총액과 구분되는지 확인한다.
- **다른 매장 수령/미수령**: 한 매장만 수령해도 다른 매장 주문은 영향받지 않는지, 미수령은 자동 환불이 아니며 수령 마감 이후 상태로 표시되는지 확인한다.
- **모의 환불 실패 모드**: 일시 오류·지속 실패·응답 유실은 시연용 백엔드를 `--mirinae.refund.mode=TRANSIENT_FAILURE|PERMANENT_FAILURE|LOST_RESPONSE`로 재기동해 재현한다. 운영·공개 환경에서 사용하지 않는다([README의 Phase 5](../README.md#주문-취소수령모의-환불-및-매장-제보-phase-5)).

정확한 고정 시각·전용 fixture로 검증하는 자동 E2E는 위 README의 브라우저 연동 검증과 Phase 5·6 fixture 절차를 따른다. **브라우저 시각만 바꾸거나 DB를 직접 수정해 서버의 시간·상태 경계를 우회하는 방식은 시연·검증 절차로 사용하지 않는다.** 실제 시간 기준 미수령은 주문 마감·수령 마감이 지난 뒤에 확인한다.

## 5. 모의 결제 내역서

구매자는 주문 내역에서 본인의 확정 주문을 열어 모의 결제 내역서를 새로 조회하고 인쇄한다. 조회 API는 `GET /api/buyer/orders/{checkoutId}/statement`이며, 본인의 확정 주문만 열 수 있고 그 밖의 주문은 결제 완료 내역으로 노출되지 않는다. 상품·수량·단가·결제 당시 총액·결제 시각과 조회 시점의 취소·환불 상태를 확인하며, 실제 청구나 공식·세무 증빙이 아닌 모의 결제 테스트 내역이다.

요청·응답·실패 계약과 인가 규칙은 [Spec의 결제 내역서 계약](../SPEC.md#관리자-운영결제-내역서-추가-계약)과 Swagger UI(`http://localhost:8080/swagger-ui/index.html`)를 참조한다.

## 6. 종료와 재개

```powershell
# 서버·프런트 종료 후 DB만 중지
docker stop mirinae-demo

# 다음 시연 때 같은 데이터로 재개
docker start mirinae-demo
```

컨테이너를 중지해도 named volume `mirinae-demo-data`의 데이터는 유지된다. 재개 후 현재 사용하는 DB 이름(`$demoDbName`)과 접속 환경변수를 다시 지정하고 같은 버전의 jar를 기본 프로필로 기동한다. 기본 종료는 `docker stop`이며, 컨테이너·볼륨 정리는 백업·복원 확인 후 별도로 판단한다.

## 7. 백업과 복원

복원은 **별도 이름의 DB**에 먼저 수행하고 검증한 뒤 접속을 전환한다. 기존 DB를 덮어쓰거나 볼륨을 삭제하는 방식은 기본 절차가 아니다. PowerShell에서 바이너리 출력을 리다이렉트하지 않고, 덤프는 컨테이너 안에서 만든 뒤 `docker cp`로 꺼낸다.

```powershell
New-Item -ItemType Directory -Force .local\backups | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$restoreDbName = "mirinae_restore_$stamp"
if ($env:DB_URL -ne "jdbc:postgresql://127.0.0.1:55438/$demoDbName") {
  throw '현재 앱의 DB_URL과 백업 원본 DB 이름을 먼저 일치시켜 주세요.'
}

# 1) 서버를 중지한 뒤(또는 쓰기가 없는 시점에) 일관된 덤프 생성
docker exec mirinae-demo pg_dump -U mirinae_demo -d $demoDbName -Fc -f /tmp/mirinae-demo-$stamp.dump
if ($LASTEXITCODE -ne 0) { throw 'pg_dump 실패: 이후 단계를 진행하지 않는다.' }
docker cp mirinae-demo:/tmp/mirinae-demo-$stamp.dump .local\backups\mirinae-demo-$stamp.dump
if ($LASTEXITCODE -ne 0) { throw 'docker cp 실패: 덤프 파일을 확인한 뒤 다시 시도한다.' }
Get-Item .local\backups\mirinae-demo-$stamp.dump | Select-Object FullName, Length

# 2) 별도 DB 생성 후 복원. 각 단계가 실패하면 다음 명령을 실행하지 않는다.
docker exec mirinae-demo createdb -U mirinae_demo $restoreDbName
if ($LASTEXITCODE -ne 0) { throw 'createdb 실패: DB 이름 중복·권한을 확인한다.' }
docker exec mirinae-demo pg_restore -U mirinae_demo --exit-on-error --no-owner -d $restoreDbName /tmp/mirinae-demo-$stamp.dump
if ($LASTEXITCODE -ne 0) { throw 'pg_restore 실패: 복원 DB를 검증 대상으로 사용하지 않는다.' }
```

`pg_restore`는 `--exit-on-error`로 첫 오류에서 중단한다. 명령을 하나씩 실행하며 각 단계의 종료 코드와 출력을 확인하고, 실패한 복원 DB는 앱 연결에 사용하지 않는다.

3. **검증**: Flyway 이력과 업무 데이터 건수·내용, 로그인 smoke를 확인한다.

```powershell
docker exec mirinae-demo psql -U mirinae_demo -d $restoreDbName -c "SELECT installed_rank, version, success FROM flyway_schema_history ORDER BY installed_rank;"
docker exec mirinae-demo psql -U mirinae_demo -d $restoreDbName -c "SELECT (SELECT count(*) FROM accounts) AS accounts, (SELECT count(*) FROM checkouts) AS checkouts, (SELECT count(*) FROM store_orders) AS store_orders, (SELECT count(*) FROM order_items) AS order_items, (SELECT count(*) FROM refunds) AS refunds;"
```

원본(`$demoDbName`)과 복원 DB(`$restoreDbName`)의 건수와 주요 행 내용(주문·주문 항목·환불 상태·금액)이 일치하는지 비교한다. 원본 접속 설정은 유지한 채 복원 DB를 별도 포트의 앱으로 확인한다.

```powershell
java -jar .local\demo\mirinae-demo.jar --server.port=18088 --spring.datasource.url="jdbc:postgresql://127.0.0.1:55438/$restoreDbName"
```

기동 로그의 Flyway·Hibernate 검증과 `http://localhost:18088/actuator/health`를 확인한다. 별도 프런트 터미널에서 `BACKEND_URL=http://127.0.0.1:18088`로 지정해 Vite를 재시작한 뒤 기존 구매자 로그인·주문·내역서 조회를 확인한다. 완료 후 이 임시 앱을 Ctrl+C로 종료한다. 실패하면 원본 DB 설정을 유지하고 전환하지 않는다.

4. **전환**: 검증이 끝나면 `DB_URL`만 복원 DB로 바꿔 **같은 버전의 앱**을 재시작한다.

```powershell
$demoDbName = $restoreDbName
$env:DB_URL = "jdbc:postgresql://127.0.0.1:55438/$demoDbName"
java -jar .local\demo\mirinae-demo.jar
```

이후 백업도 갱신한 `$demoDbName`을 사용한다. Vite의 `BACKEND_URL`을 일반 앱 포트로 되돌려 재시작한다. 기존 DB·볼륨은 검증·전환 후에도 임의로 삭제하지 않는다. 스키마가 바뀌는 버전으로 갱신·복원할 때는 [ADR-008](ADR.md#adr-008--2026-10-15--관리자-초기-생성과-원자적-운영-변경-이력)·[ADR-010](ADR.md#adr-010--2026-10-19--주문-운영-상태와-영속-모의-환불-복구)의 호환성 제약을 함께 확인하고, 이전 앱을 새 스키마 DB에 직접 연결하지 않는다.

## 8. 이번 범위의 한계

- 실제 결제·PG 연동, 공식 영수증·세무 증빙 발급은 포함하지 않는다. 내역서는 모의 결제 테스트 내역이다.
- 체험용 외부 배포, 운영 모니터링·자동 백업은 이 절차에 포함하지 않는다. 필요하면 환경·접근 범위·복구·smoke 계획을 별도로 확정한다.
- 이 문서의 명령은 새 시연 DB를 전제로 하며, 기존 수동 테스트 DB의 초기화·마이그레이션을 수행하지 않는다.
