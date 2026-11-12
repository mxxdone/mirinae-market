package com.mirinae.market.modules.auth.business;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Base64;
import org.junit.jupiter.api.Test;

/** PKCE·refresh 해시·무작위 식별자의 핵심 규칙을 검증한다. */
class AuthSecretsTest {

  @Test
  void pkceChallengeMatchesRfc7636Example() {
    // RFC 7636 부록 B의 verifier/challenge 예시다.
    assertThat(AuthSecrets.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
        .isEqualTo("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  }

  @Test
  void refreshHashIsStableSha256HexAndNeverTheOriginal() {
    String token = "refresh-token-value";
    String hash = AuthSecrets.hash(token);
    assertThat(hash).hasSize(64).isEqualTo(AuthSecrets.hash(token)).doesNotContain(token);
  }

  @Test
  void randomTokensAreUrlSafeUniqueAndLongEnough() {
    String first = AuthSecrets.randomToken();
    String second = AuthSecrets.randomToken();
    assertThat(first).isNotEqualTo(second).doesNotContain("+", "/", "=");
    assertThat(Base64.getUrlDecoder().decode(first)).hasSize(32);
  }
}
