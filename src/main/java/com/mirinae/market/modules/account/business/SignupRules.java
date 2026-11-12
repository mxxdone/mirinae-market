package com.mirinae.market.modules.account.business;

import java.util.Locale;
import java.util.regex.Pattern;

final class SignupRules {
  // 내부 계정 생성·데모 초기화는 기존 식별자(demo_buyer 등)를 보존하기 위해 기존 규칙을 유지한다.
  private static final Pattern LEGACY_LOGIN_ID = Pattern.compile("[a-z0-9_-]{5,20}");
  private static final Pattern PUBLIC_LOGIN_ID = Pattern.compile("[a-z0-9]{5,20}");
  private static final Pattern DISPLAY_NAME = Pattern.compile("[가-힣A-Za-z0-9]{2,10}");
  private static final Pattern PASSWORD = Pattern.compile("[!-~]{8,32}");
  private static final Pattern LETTER = Pattern.compile("[A-Za-z]");
  private static final Pattern DIGIT = Pattern.compile("[0-9]");
  private static final Pattern SPECIAL = Pattern.compile("[^A-Za-z0-9]");
  private static final Pattern LOCAL_PART =
      Pattern.compile("[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*");
  private static final Pattern DOMAIN =
      Pattern.compile(
          "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+");

  private SignupRules() {}

  static void publicLoginId(String loginId) {
    require(
        loginId != null && PUBLIC_LOGIN_ID.matcher(loginId).matches(),
        "영문 소문자와 숫자만 사용하여 5~20자로 입력해 주세요.");
  }

  static void displayName(String displayName) {
    require(
        displayName != null && DISPLAY_NAME.matcher(displayName).matches(),
        "표시 이름은 2~10자의 한글·영문·숫자여야 합니다.");
  }

  /** 형식이 올바른 이메일만 정규화해 돌려주고, 아니면 null이다. 제공자 값 보완 판단에 사용한다. */
  public static String optionalEmail(String email) {
    if (email == null) return null;
    try {
      return email(email);
    } catch (IllegalArgumentException exception) {
      return null;
    }
  }

  static String validate(String loginId, String password, String displayName, String email) {
    require(
        loginId != null && LEGACY_LOGIN_ID.matcher(loginId).matches(),
        "ID는 5~20자의 영문 소문자·숫자·밑줄·하이픈이어야 합니다.");
    require(
        displayName != null && DISPLAY_NAME.matcher(displayName).matches(),
        "표시 이름은 2~10자의 한글·영문·숫자여야 합니다.");
    password(password);
    return email(email);
  }

  static void password(String password) {
    require(
        password != null
            && PASSWORD.matcher(password).matches()
            && LETTER.matcher(password).find()
            && DIGIT.matcher(password).find()
            && SPECIAL.matcher(password).find(),
        "비밀번호는 8~32자의 영문·숫자·특수문자를 모두 포함해야 합니다.");
  }

  static String email(String email) {
    require(email != null, "이메일은 필수입니다.");
    String normalized = email.strip().toLowerCase(Locale.ROOT);
    String[] parts = normalized.split("@", -1);
    require(
        normalized.length() <= 254
            && parts.length == 2
            && parts[0].length() <= 64
            && LOCAL_PART.matcher(parts[0]).matches()
            && DOMAIN.matcher(parts[1]).matches(),
        "올바른 이메일을 입력해 주세요.");
    return normalized;
  }

  private static void require(boolean valid, String message) {
    if (!valid) {
      throw new IllegalArgumentException(message);
    }
  }
}
