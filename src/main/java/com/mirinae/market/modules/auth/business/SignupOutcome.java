package com.mirinae.market.modules.auth.business;

/**
 * 소셜 가입 시도의 결과다. 성공하면 토큰이, 같은 이메일의 기존 회원이면 연결이 필요하다는 흐름 ID가 담긴다. Presentation은 이 일반 값을 보고 201/200
 * 또는 409 LINK_REQUIRED와 새 흐름 쿠키를 설정한다. 예외에 HTTP 타입을 넣지 않는다.
 */
public sealed interface SignupOutcome {

  /** 가입·즉시 로그인 성공이다. */
  record Success(AuthService.LoginResult tokens) implements SignupOutcome {}

  /** 같은 이메일의 기존 회원이 있어 계정 연결이 필요하다. 새 흐름이 저장되어 있다. */
  record LinkRequired(String flowId) implements SignupOutcome {}
}
