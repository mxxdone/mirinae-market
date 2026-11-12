package com.mirinae.market.modules.account.business;

/** 다른 기능이 계정과 같은 이메일 규칙을 사용할 수 있게 노출하는 공개 Business 규칙이다. 실제 검증·정규화는 SignupRules에 단일 구현한다. */
public final class EmailRule {
  private EmailRule() {}

  /** 형식이 올바른 이메일만 정규화해 돌려주고, 아니면 null이다. */
  public static String normalize(String email) {
    return SignupRules.optionalEmail(email);
  }
}
