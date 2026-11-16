package com.mirinae.market.modules.auth.data;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 제공자 userinfo JSON 해석만 실제 JsonMapper로 검증한다. HTTP SDK 대역 없이 파싱 규칙(이름 유지, 명시적 무효 이메일 제외, strict
 * boolean 확인 상태)을 고정한다.
 */
class OAuthProviderUserParsingTest {
  private final JsonMapper mapper = JsonMapper.builder().build();

  private JsonNode json(String text) {
    return mapper.readTree(text);
  }

  @Test
  void 카카오_정상_응답은_이름과_이메일을_보존하고_확인됨으로_표시한다() {
    ProviderUser user =
        OAuthHttpClient.kakaoProviderUser(
            json(
                """
                {"id":12345,"kakao_account":{"email":"user@example.com","is_email_valid":true,
                 "is_email_verified":true,"profile":{"nickname":"시장손님"}}}
                """));

    assertThat(user.provider()).isEqualTo("kakao");
    assertThat(user.subject()).isEqualTo("12345");
    assertThat(user.displayName()).isEqualTo("시장손님");
    assertThat(user.email()).isEqualTo("user@example.com");
    assertThat(user.providerEmailVerified()).isTrue();
  }

  @Test
  void 카카오_이메일이_없으면_이름만_유지하고_미확인이다() {
    ProviderUser user =
        OAuthHttpClient.kakaoProviderUser(
            json(
                """
                {"id":7,"kakao_account":{"is_email_valid":true,"is_email_verified":true,
                 "profile":{"nickname":"이름만"}}}
                """));

    assertThat(user.displayName()).isEqualTo("이름만");
    assertThat(user.email()).isNull();
    assertThat(user.providerEmailVerified()).isFalse();
  }

  @Test
  void 카카오가_명시적으로_무효라고_한_이메일은_비우고_이름은_유지한다() {
    ProviderUser user =
        OAuthHttpClient.kakaoProviderUser(
            json(
                """
                {"id":7,"kakao_account":{"email":"stale@example.com","is_email_valid":false,
                 "is_email_verified":true,"profile":{"nickname":"무효손님"}}}
                """));

    assertThat(user.displayName()).isEqualTo("무효손님");
    assertThat(user.email()).isNull();
    assertThat(user.providerEmailVerified()).isFalse();
  }

  @Test
  void 카카오_확인_플래그가_false_누락_문자열이면_미확인이다() {
    String[] accountBodies = {
      "\"email\":\"a@example.com\",\"is_email_valid\":true,\"is_email_verified\":false",
      "\"email\":\"b@example.com\",\"is_email_valid\":true",
      "\"email\":\"c@example.com\",\"is_email_valid\":true,\"is_email_verified\":\"true\"",
      "\"email\":\"d@example.com\",\"is_email_valid\":\"true\",\"is_email_verified\":true"
    };

    for (String body : accountBodies) {
      ProviderUser user =
          OAuthHttpClient.kakaoProviderUser(json("{\"id\":9,\"kakao_account\":{" + body + "}}"));
      // 확인 상태가 true가 아니어도 이메일 자체는 가입 폼 보완용으로 유지한다.
      assertThat(user.email()).isNotNull();
      assertThat(user.providerEmailVerified()).as(body).isFalse();
    }
  }

  @Test
  void 구글_정상_응답과_누락_문자열_플래그를_구분한다() {
    ProviderUser verified =
        OAuthHttpClient.googleProviderUser(
            json(
                """
                {"sub":"google-sub","name":"구글손님","email":"g@example.com","email_verified":true}
                """));
    assertThat(verified.provider()).isEqualTo("google");
    assertThat(verified.subject()).isEqualTo("google-sub");
    assertThat(verified.displayName()).isEqualTo("구글손님");
    assertThat(verified.email()).isEqualTo("g@example.com");
    assertThat(verified.providerEmailVerified()).isTrue();

    ProviderUser missing =
        OAuthHttpClient.googleProviderUser(
            json("{\"sub\":\"s2\",\"name\":\"구글손님\",\"email\":\"g2@example.com\"}"));
    assertThat(missing.providerEmailVerified()).isFalse();
    assertThat(missing.email()).isEqualTo("g2@example.com");

    ProviderUser textual =
        OAuthHttpClient.googleProviderUser(
            json("{\"sub\":\"s3\",\"email\":\"g3@example.com\",\"email_verified\":\"true\"}"));
    // 문자열 "true"는 인증 결과로 강제 변환하지 않는다.
    assertThat(textual.providerEmailVerified()).isFalse();

    ProviderUser falseFlag =
        OAuthHttpClient.googleProviderUser(
            json("{\"sub\":\"s4\",\"email\":\"g4@example.com\",\"email_verified\":false}"));
    assertThat(falseFlag.providerEmailVerified()).isFalse();
  }

  @Test
  void 제공자_사용자_식별자가_없으면_흐름을_만들지_않는다() {
    assertThatThrownBy(() -> OAuthHttpClient.kakaoProviderUser(json("{\"kakao_account\":{}}")))
        .isInstanceOf(OAuthProviderUnavailableException.class);
    assertThatThrownBy(() -> OAuthHttpClient.googleProviderUser(json("{\"email\":\"a@b.com\"}")))
        .isInstanceOf(OAuthProviderUnavailableException.class);
  }
}
