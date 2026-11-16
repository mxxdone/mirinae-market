package com.mirinae.market.modules.account.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.mirinae.market.support.PostgresTestConfig;
import com.mirinae.market.support.RedisTestConfig;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;

/**
 * 구매자 표시 이름 변경의 업무 규칙을 실제 PostgreSQL 위에서 검증한다. HTTP 상태·CSRF·me 반영 계약은 {@code AccountHttpFlowTest}가
 * 담당한다.
 */
@SpringBootTest
@Import({PostgresTestConfig.class, RedisTestConfig.class})
class BuyerDisplayNameChangeTest {
  private static final String PASSWORD = "Pass1234!";

  @Autowired private AccountService accounts;
  @Autowired private JdbcTemplate jdbc;

  private static String uniqueId() {
    return "n" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
  }

  private String email(long id) {
    return jdbc.queryForObject("SELECT email FROM accounts WHERE id=?", String.class, id);
  }

  private String displayName(long id) {
    return jdbc.queryForObject("SELECT display_name FROM accounts WHERE id=?", String.class, id);
  }

  @Test
  void 활성_구매자는_본인_표시_이름만_바꾸고_다른_필드는_유지한다() {
    AccountView buyer = accounts.signup(uniqueId(), PASSWORD, "기존이름", uniqueId() + "@example.com");
    AccountView other = accounts.signup(uniqueId(), PASSWORD, "다른이름", uniqueId() + "@example.com");
    String beforeEmail = email(buyer.id());
    String beforeHash =
        jdbc.queryForObject(
            "SELECT password_hash FROM accounts WHERE id=?", String.class, buyer.id());

    assertThat(accounts.changeBuyerDisplayName(buyer.loginId(), "새별명")).isEqualTo("새별명");

    // 표시 이름만 바뀌고 이메일·로그인 ID·역할·인증 버전·비밀번호 해시는 유지된다.
    assertThat(displayName(buyer.id())).isEqualTo("새별명");
    assertThat(email(buyer.id())).isEqualTo(beforeEmail);
    assertThat(
            jdbc.queryForObject(
                "SELECT login_id FROM accounts WHERE id=?", String.class, buyer.id()))
        .isEqualTo(buyer.loginId());
    assertThat(
            jdbc.queryForObject("SELECT role FROM accounts WHERE id=?", String.class, buyer.id()))
        .isEqualTo("BUYER");
    assertThat(
            jdbc.queryForObject(
                "SELECT auth_version FROM accounts WHERE id=?", Long.class, buyer.id()))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT password_hash FROM accounts WHERE id=?", String.class, buyer.id()))
        .isEqualTo(beforeHash);

    // 같은 요청으로 다른 회원의 이름은 바뀌지 않는다.
    assertThat(displayName(other.id())).isEqualTo("다른이름");
  }

  @Test
  void 표시_이름_경계값을_허용하고_위반값은_기존_값을_유지한다() {
    AccountView buyer = accounts.signup(uniqueId(), PASSWORD, "기존이름", uniqueId() + "@example.com");

    assertThat(accounts.changeBuyerDisplayName(buyer.loginId(), "가나")).isEqualTo("가나");
    String longest = "가".repeat(10);
    assertThat(accounts.changeBuyerDisplayName(buyer.loginId(), longest)).isEqualTo(longest);
    assertThat(accounts.changeBuyerDisplayName(buyer.loginId(), "Ab12가나")).isEqualTo("Ab12가나");

    for (String invalid : List.of("가", "가".repeat(11), "가 나", "별명!", "별명😀", " 가나 ")) {
      assertThatThrownBy(() -> accounts.changeBuyerDisplayName(buyer.loginId(), invalid))
          .as("잘못된 표시 이름: %s", invalid)
          .isInstanceOf(IllegalArgumentException.class);
    }
    assertThatThrownBy(() -> accounts.changeBuyerDisplayName(buyer.loginId(), null))
        .isInstanceOf(IllegalArgumentException.class);

    // 거절된 요청은 마지막으로 저장된 값을 덮어쓰지 않는다.
    assertThat(displayName(buyer.id())).isEqualTo("Ab12가나");
  }

  @Test
  void 다른_역할과_탈퇴한_계정은_표시_이름을_바꿀_수_없다() {
    AccountView seller =
        accounts.ensureDemoAccount(
            uniqueId(), PASSWORD, "판매자", uniqueId() + "@example.com", "SELLER");

    assertThatThrownBy(() -> accounts.changeBuyerDisplayName(seller.loginId(), "새별명"))
        .isInstanceOf(AccessDeniedException.class);
    assertThat(displayName(seller.id())).isEqualTo("판매자");

    AccountView buyer = accounts.signup(uniqueId(), PASSWORD, "기존이름", uniqueId() + "@example.com");
    accounts.deactivateBuyer(buyer.id(), Instant.now());

    assertThatThrownBy(() -> accounts.changeBuyerDisplayName(buyer.loginId(), "새별명"))
        .isInstanceOf(AccountInactiveException.class);
    assertThat(displayName(buyer.id())).isEqualTo("탈퇴회원");
  }
}
