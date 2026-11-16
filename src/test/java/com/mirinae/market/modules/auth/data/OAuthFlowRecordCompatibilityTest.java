package com.mirinae.market.modules.auth.data;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** 흐름 JSON 호환과 화면 노출 범위를 고정한다. 확인 상태는 SIGNUP에서만 공개한다. */
class OAuthFlowRecordCompatibilityTest {
  private final JsonMapper mapper = JsonMapper.builder().build();

  @Test
  void 확인_필드가_없는_기존_Redis_흐름은_미확인으로_읽는다() {
    String legacy =
        """
        {"flowId":"f1","status":"SIGNUP","purpose":"login","provider":"kakao","subject":"7",
         "displayName":"기존손님","email":"old@example.com","candidateAccountId":null,
         "candidateAuthVersion":null,"sourceProvider":null,"sourceSubject":null,
         "linkVerified":false,"accountId":null,"sid":null,"authVersion":null,"message":null}
        """;

    OAuthFlowRecord flow = mapper.readValue(legacy, OAuthFlowRecord.class);

    assertThat(flow.providerEmailVerified()).isFalse();
    assertThat(flow.view().providerEmailVerified()).isFalse();
    // 기존 필드의 의미는 그대로다.
    assertThat(flow.view().displayName()).isEqualTo("기존손님");
    assertThat(flow.view().email()).isEqualTo("old@example.com");

    OAuthFlowRecord explicitNull =
        mapper.readValue(
            legacy.replace(
                "\"status\":\"SIGNUP\"", "\"status\":\"SIGNUP\",\"providerEmailVerified\":null"),
            OAuthFlowRecord.class);
    assertThat(explicitNull.providerEmailVerified()).isFalse();
    assertThat(explicitNull.view().email()).isEqualTo("old@example.com");
  }

  @Test
  void 확인_상태는_SIGNUP_화면에만_노출한다() {
    OAuthFlowRecord signup =
        OAuthFlowRecord.loginFlow(
            "f2", "SIGNUP", "kakao", "7", "가입손님", "a@example.com", true, null);
    assertThat(signup.view().providerEmailVerified()).isTrue();
    assertThat(signup.view().displayName()).isEqualTo("가입손님");
    assertThat(signup.view().email()).isEqualTo("a@example.com");

    OAuthFlowRecord login =
        OAuthFlowRecord.loginFlow("f3", "LOGIN", "kakao", "7", "가입손님", "a@example.com", true, null);
    assertThat(login.view().providerEmailVerified()).isFalse();
    assertThat(login.view().displayName()).isNull();
    assertThat(login.view().email()).isNull();

    OAuthFlowRecord link =
        OAuthFlowRecord.linkFlow(
            "f4", "kakao", "7", "a@example.com", 1L, 0L, null, null, false, null);
    assertThat(link.view().providerEmailVerified()).isFalse();
    assertThat(link.view().email()).isNull();

    OAuthFlowRecord reauth =
        OAuthFlowRecord.reauthFlow("f5", "kakao", 1L, "s", 0L, false, null, null, null);
    assertThat(reauth.view().providerEmailVerified()).isFalse();

    OAuthFlowRecord error = OAuthFlowRecord.errorFlow("f6", "안내");
    assertThat(error.view().providerEmailVerified()).isFalse();
  }

  @Test
  void 재인증_완료_처리는_확인_상태와_나머지_정보를_보존한다() {
    OAuthFlowRecord pending =
        OAuthFlowRecord.linkFlow(
            "f7", "kakao", "7", "a@example.com", 1L, 0L, null, null, false, null);

    OAuthFlowRecord verified = pending.verified("kakao", "7");

    assertThat(verified.providerEmailVerified()).isFalse();
    assertThat(verified.linkVerified()).isTrue();
    assertThat(verified.candidateAccountId()).isEqualTo(1L);
  }
}
