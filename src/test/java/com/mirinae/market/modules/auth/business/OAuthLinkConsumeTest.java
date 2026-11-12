package com.mirinae.market.modules.auth.business;

import static org.assertj.core.api.Assertions.assertThat;

import com.mirinae.market.modules.account.business.AccountForbiddenException;
import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.account.business.AccountView;
import com.mirinae.market.modules.auth.data.OAuthFlowRecord;
import com.mirinae.market.modules.auth.data.RedisOAuthStore;
import com.mirinae.market.support.PostgresTestConfig;
import com.mirinae.market.support.RedisTestConfig;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 계정 연결 proof의 원자 소비를 실제 Redis(Lua GETDEL)와 실제 PostgreSQL 위에서 검증한다.
 *
 * <p>경계: 이 테스트는 {@link OAuthService#link}를 직접 호출한다. HTTP 상태 코드·쿠키 계약은 {@code AuthHttpFlowTest}가
 * 담당하고, 여기서는 "검증 후 proof 1회 소비 → DB 변경 → 재제출 거부"라는 업무 경계만 다룬다. 소비 구현을 복제하지 않고 실제 저장소·DB를 통과시킨다.
 */
@SpringBootTest
@Import({PostgresTestConfig.class, RedisTestConfig.class})
class OAuthLinkConsumeTest {
  private static final String PASSWORD = "Pass1234!";

  @Autowired private OAuthService oauth;
  @Autowired private RedisOAuthStore store;
  @Autowired private AccountService accounts;
  @Autowired private AuthPolicy policy;
  @Autowired private JdbcTemplate jdbc;

  private static String uniqueId() {
    return "l" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
  }

  /** 후보 계정과 그 버전에 묶인 LINK 흐름을 Redis에 저장한다. 화면·컨트롤러 없이 업무 경계만 세운다. */
  private OAuthFlowRecord saveLinkFlow(AccountView account, String subject) {
    long version =
        jdbc.queryForObject(
            "SELECT auth_version FROM accounts WHERE id=?", Long.class, account.id());
    OAuthFlowRecord flow =
        OAuthFlowRecord.linkFlow(
            UUID.randomUUID().toString(),
            "kakao",
            subject,
            null,
            account.id(),
            version,
            null,
            null,
            false,
            "같은 이메일의 기존 계정이 있습니다.");
    store.saveFlow(flow, policy.stateTtl());
    return flow;
  }

  @SuppressWarnings("PMD.DoNotUseThreads")
  @Test
  void 저장소_수준에서_같은_흐름을_동시에_소비하면_정확히_하나만_값을_받는다() throws Exception {
    AccountView account =
        accounts.signup(uniqueId(), PASSWORD, "연결손님", uniqueId() + "@example.com");
    OAuthFlowRecord flow = saveLinkFlow(account, "subject-" + UUID.randomUUID());

    // 실제 Redis의 Lua GETDEL 경계를 직접 겨냥한다. 조회만 하고 삭제하지 않는 구현이면
    // 두 스레드가 모두 값을 받아 이 검증이 실패한다.
    CyclicBarrier barrier = new CyclicBarrier(2);
    Callable<OAuthFlowRecord> claim =
        () -> {
          barrier.await(20, TimeUnit.SECONDS);
          return store.consumeFlow(flow.flowId());
        };

    List<OAuthFlowRecord> claimed = new ArrayList<>();
    try (var executor = Executors.newFixedThreadPool(2)) {
      var first = executor.submit(claim);
      var second = executor.submit(claim);
      claimed.add(first.get(30, TimeUnit.SECONDS));
      claimed.add(second.get(30, TimeUnit.SECONDS));
    }

    assertThat(claimed).filteredOn(java.util.Objects::nonNull).hasSize(1);
    assertThat(claimed).filteredOn(java.util.Objects::isNull).hasSize(1);
  }

  /**
   * 동시 제출 경합을 만들기 위해 스레드를 쓴다. 웹 컨테이너 밖에서 두 제출을 동시에 시작하는 테스트 전용이며, executor는 try-with-resources로
   * 종료한다. 생산 코드의 동시성 규칙은 그대로 유지된다.
   */
  @SuppressWarnings("PMD.DoNotUseThreads")
  @Test
  void 동시에_같은_증명을_제출하면_정확히_하나만_연결에_성공한다() throws Exception {
    AccountView account =
        accounts.signup(uniqueId(), PASSWORD, "연결손님", uniqueId() + "@example.com");
    String subject = "subject-" + UUID.randomUUID();
    OAuthFlowRecord flow = saveLinkFlow(account, subject);

    CyclicBarrier barrier = new CyclicBarrier(2);
    Callable<String> submit =
        () -> {
          barrier.await(20, TimeUnit.SECONDS);
          try {
            oauth.link(flow.flowId(), true, account.loginId(), PASSWORD);
            return "OK";
          } catch (AuthException exception) {
            return exception.code();
          }
        };

    List<String> outcomes = new ArrayList<>();
    try (var executor = Executors.newFixedThreadPool(2)) {
      var first = executor.submit(submit);
      var second = executor.submit(submit);
      outcomes.add(first.get(30, TimeUnit.SECONDS));
      outcomes.add(second.get(30, TimeUnit.SECONDS));
    }

    // 하나만 proof를 소비해 로그인 결과를 받고, 다른 하나는 소비 실패(UNAUTHENTICATED) 또는
    // 이미 연결된 신원과의 충돌(LINK_CONFLICT)로 거부된다.
    assertThat(outcomes).filteredOn("OK"::equals).hasSize(1);
    assertThat(outcomes)
        .filteredOn(outcome -> !"OK".equals(outcome))
        .hasSize(1)
        .allSatisfy(outcome -> assertThat(outcome).isIn("UNAUTHENTICATED", "LINK_CONFLICT"));
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM social_identities WHERE provider='kakao' AND subject=?",
                Long.class,
                subject))
        .isEqualTo(1L);
  }

  @Test
  void proof를_소비한_뒤_DB_변경이_실패하면_같은_증명_재제출은_거부된다() {
    AccountView account =
        accounts.signup(uniqueId(), PASSWORD, "연결손님", uniqueId() + "@example.com");
    String subject = "subject-" + UUID.randomUUID();
    OAuthFlowRecord flow = saveLinkFlow(account, subject);

    // proof 발급 이후 비밀번호 변경·탈퇴 경합처럼 계정 버전이 올라간 상황을 만든다.
    // 그러면 consume 뒤 connectIdentity의 DB 재확인이 실패한다.
    accounts.bumpAuthVersion(account.id());

    Object failure =
        org.assertj.core.api.Assertions.catchThrowable(
            () -> oauth.link(flow.flowId(), true, account.loginId(), PASSWORD));
    assertThat(failure).isInstanceOf(AccountForbiddenException.class);

    // proof는 이미 소비됐으므로, 같은 flowId로 다시 제출하면 인증 정보를 요구하지 않고 만료로 거부된다.
    Object resubmission =
        org.assertj.core.api.Assertions.catchThrowable(
            () -> oauth.link(flow.flowId(), true, account.loginId(), PASSWORD));
    assertThat(resubmission).isInstanceOf(AuthException.class);
    assertThat(((AuthException) resubmission).code()).isEqualTo("UNAUTHENTICATED");

    // 실패한 시도는 소셜 신원을 남기지 않는다.
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM social_identities WHERE provider='kakao' AND subject=?",
                Long.class,
                subject))
        .isZero();
  }
}
