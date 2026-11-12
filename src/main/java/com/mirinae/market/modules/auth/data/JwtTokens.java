package com.mirinae.market.modules.auth.data;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.OctetSequenceKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Component;

/**
 * 서비스 access/refresh JWT를 발급·검증한다. JOSE SDK는 이 Data 계층에만 두며, 시각은 주입된 Clock을 사용해 E2E 고정 시각과 일치시킨다.
 */
@Component
public class JwtTokens {
  public static final String ISSUER = "mirinae-market";

  /** access/refresh 토큰의 대상(audience)은 ADR-015대로 분리한다. */
  public static final String ACCESS_AUDIENCE = "mirinae-market-access";

  public static final String REFRESH_AUDIENCE = "mirinae-market-refresh";

  /** 토큰 종류 판별값이다. Business는 아래 타입 안전 접근자만 사용한다. */
  private static final String TYPE_ACCESS = "access";

  private static final String TYPE_REFRESH = "refresh";

  /** access 토큰 종류다. */
  public static String accessType() {
    return TYPE_ACCESS;
  }

  /** refresh 토큰 종류다. */
  public static String refreshType() {
    return TYPE_REFRESH;
  }

  /** access 토큰을 검증한다. */
  public ParsedToken parseAccess(String token) {
    return parse(token, TYPE_ACCESS, ACCESS_AUDIENCE);
  }

  /** refresh 토큰을 검증한다. */
  public ParsedToken parseRefresh(String token) {
    return parse(token, TYPE_REFRESH, REFRESH_AUDIENCE);
  }

  private final NimbusJwtEncoder encoder;
  private final NimbusJwtDecoder decoder;
  private final Clock clock;

  JwtTokens(@Value("${auth.jwt.secret}") String base64Secret, Clock clock) {
    byte[] key = Base64.getDecoder().decode(base64Secret);
    if (key.length < 32) {
      throw new IllegalStateException("AUTH_JWT_SECRET은 Base64로 인코딩한 32바이트 이상 키여야 합니다.");
    }
    SecretKeySpec secret = new SecretKeySpec(key, "HmacSHA256");
    JWKSource<SecurityContext> source =
        new ImmutableJWKSet<>(
            new JWKSet(
                new OctetSequenceKey.Builder(secret)
                    .algorithm(com.nimbusds.jose.JWSAlgorithm.HS256)
                    .keyID("mirinae-market")
                    .build()));
    this.encoder = new NimbusJwtEncoder(source);
    this.decoder = NimbusJwtDecoder.withSecretKey(secret).macAlgorithm(MacAlgorithm.HS256).build();
    var timestamps =
        new org.springframework.security.oauth2.jwt.JwtTimestampValidator(Duration.ZERO);
    timestamps.setClock(clock);
    this.decoder.setJwtValidator(
        new org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator<>(
            timestamps,
            new org.springframework.security.oauth2.jwt.JwtClaimValidator<String>(
                "iss", ISSUER::equals)));
    this.clock = clock;
  }

  /** access JWT를 발급한다. exp는 주어진 절대 기한을 넘지 않는다. */
  public String access(
      long accountId, String sid, String role, long authVersion, Duration ttl, Instant notAfter) {
    Instant now = Instant.now(clock);
    Instant expiresAt = earliest(now.plus(ttl), notAfter);
    JwtClaimsSet claims =
        JwtClaimsSet.builder()
            .issuer(ISSUER)
            .audience(java.util.List.of(ACCESS_AUDIENCE))
            .subject(Long.toString(accountId))
            .issuedAt(now)
            .expiresAt(expiresAt)
            .claim("typ", TYPE_ACCESS)
            .claim("sid", sid)
            .claim("role", role)
            .claim("ver", authVersion)
            .build();
    return encode(claims);
  }

  /** refresh JWT를 발급한다. 절대 기한은 로그인 최초 발급 기준을 유지한다. */
  public String refresh(
      long accountId, String sid, long authVersion, long generation, Instant expiresAt) {
    Instant now = Instant.now(clock);
    JwtClaimsSet claims =
        JwtClaimsSet.builder()
            .issuer(ISSUER)
            .audience(java.util.List.of(REFRESH_AUDIENCE))
            .subject(Long.toString(accountId))
            .issuedAt(now)
            .expiresAt(expiresAt)
            .claim("typ", TYPE_REFRESH)
            .claim("sid", sid)
            .claim("ver", authVersion)
            .claim("gen", generation)
            .claim("jti", UUID.randomUUID().toString())
            .build();
    return encode(claims);
  }

  private static Instant earliest(Instant first, Instant second) {
    return first.isBefore(second) ? first : second;
  }

  private String encode(JwtClaimsSet claims) {
    return encoder
        .encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
        .getTokenValue();
  }

  /** 서명·발급자·대상·용도·만료를 검증한다. 실패는 null이며 호출자는 인증 실패로 처리한다. */
  private ParsedToken parse(String token, String expectedType, String expectedAudience) {
    if (token == null || token.isBlank()) return null;
    try {
      var jwt = decoder.decode(token);
      if (!jwt.getAudience().contains(expectedAudience)) return null;
      if (!expectedType.equals(jwt.getClaimAsString("typ"))) return null;
      var sid = jwt.getClaimAsString("sid");
      var subject = jwt.getSubject();
      if (sid == null || sid.isBlank() || subject == null) return null;
      Long accountId;
      try {
        accountId = Long.parseLong(subject);
      } catch (NumberFormatException exception) {
        return null;
      }
      Long version = numericClaim(jwt, "ver");
      Long generation = numericClaim(jwt, "gen");
      if (version == null) return null;
      if (TYPE_REFRESH.equals(expectedType) && generation == null) return null;
      if (jwt.getExpiresAt() == null) return null;
      return new ParsedToken(accountId, sid, version, generation, jwt.getExpiresAt());
    } catch (org.springframework.security.oauth2.jwt.JwtException exception) {
      return null;
    }
  }

  /** 숫자 클레임을 JSON 역직렬화 타입(정수·실수)과 무관하게 long으로 읽는다. */
  private static Long numericClaim(org.springframework.security.oauth2.jwt.Jwt jwt, String name) {
    Object value = jwt.getClaim(name);
    if (value instanceof Number number) return number.longValue();
    return null;
  }

  /** 서명이 검증된 토큰의 최소 정보다. expiresAt은 원래 절대 만료 시각이다. */
  public record ParsedToken(
      long accountId, String sid, long authVersion, Long generation, Instant expiresAt) {}
}
