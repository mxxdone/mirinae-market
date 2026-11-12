package com.mirinae.market.modules.auth.business;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/** 인증 흐름의 무작위 식별자·PKCE·해시 계산을 담당한다. */
public final class AuthSecrets {
  private static final SecureRandom RANDOM = new SecureRandom();

  private AuthSecrets() {}

  /** URL에 안전한 무작위 식별자다. */
  public static String randomToken() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  /** PKCE S256 code challenge다. */
  public static String challenge(String verifier) {
    return Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(sha256(verifier.getBytes(StandardCharsets.US_ASCII)));
  }

  /** refresh 원문 대신 저장하는 SHA-256 비교값이다. */
  public static String hash(String value) {
    return HexFormat.of().formatHex(sha256(value.getBytes(StandardCharsets.UTF_8)));
  }

  private static byte[] sha256(byte[] input) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(input);
    } catch (java.security.NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256을 사용할 수 없습니다.", exception);
    }
  }
}
