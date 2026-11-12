package com.mirinae.market.modules.account.business;

import java.util.List;

/**
 * 다른 기능이 사용하는 계정 공개 Business 진입점의 인증 관련 계약이다. AccountService가 구현하며 auth·withdrawal 기능은 이 인터페이스를 통해
 * 계정 상태를 조회·변경한다.
 */
public interface AccountAuthGateway {

  /** 로그인 ID로 인증 판단용 계정 상태를 조회한다. 없는 계정은 비어 있다. */
  java.util.Optional<AccountAuthentication> accountForAuthentication(String loginId);

  /** 내부 계정 ID로 인증 판단용 계정 상태를 조회한다. */
  java.util.Optional<AccountAuthentication> accountForAuthentication(long accountId);

  /** 계정에 연결된 소셜 제공자 목록이다. */
  List<String> linkedProviders(long accountId);

  /** 같은 이메일의 활성 계정 후보 ID다. 소유 확인 전에는 화면에 노출하지 않는다. */
  java.util.Optional<Long> activeAccountIdByEmail(String email);

  /** 형식이 올바른 이메일의 후보 ID다. 누락·형식 오류는 빈 값으로 처리한다. */
  java.util.Optional<Long> activeAccountIdByEmailOrEmpty(String email);

  /** 제공자 신원으로 연결된 활성 계정 ID다. */
  java.util.Optional<Long> activeAccountIdByIdentity(String provider, String subject);

  /** 소셜 신원을 기존 계정에 연결한다. 계정 잠금·활성·역할·버전을 다시 확인한 뒤 삽입한다. */
  void connectIdentity(long accountId, long expectedAuthVersion, String provider, String subject);

  /** 제공자 신원이 아직 다른 활성 계정에 연결되지 않았는지 확인한다. */
  boolean identityAvailable(String provider, String subject);

  /** 비밀번호 없는 소셜 구매자 계정을 만들고 신원을 연결한다. */
  AccountAuthentication registerSocialBuyer(
      String displayName, String email, String provider, String subject);

  /** 계정 인증 버전을 증가시켜 모든 기기의 기존 토큰을 이후 요청부터 거절한다. */
  long bumpAuthVersion(long accountId);

  /** 현재 사용자 응답·인가 판단에 쓰는 최소 계정 정보다. */
  AccountSummary summary(String loginId);

  /** 계정에 연결된 소셜 신원 목록이다. */
  java.util.List<LinkedIdentity> linkedIdentities(long accountId);

  /** 소셜 전용 계정 여부다. 로컬 비밀번호가 없으면 true다. */
  boolean socialOnly(long accountId);
}
