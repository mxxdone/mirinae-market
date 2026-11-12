package com.mirinae.market.modules.account.business;

import com.mirinae.market.modules.account.data.AccountAuthRow;
import com.mirinae.market.modules.account.data.AccountData;
import com.mirinae.market.modules.account.data.AccountRow;
import com.mirinae.market.modules.account.data.DuplicateAccountDataException;
import java.util.List;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AccountService implements AccountAuthGateway {
  private final AccountData data;
  private final PasswordEncoder encoder;

  public AccountService(AccountData data, PasswordEncoder encoder) {
    this.data = data;
    this.encoder = encoder;
  }

  public AccountView signup(String loginId, String password, String displayName, String email) {
    SignupRules.publicLoginId(loginId);
    return create(loginId, password, displayName, email, "BUYER");
  }

  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public boolean loginIdAvailable(String loginId) {
    SignupRules.publicLoginId(loginId);
    return !data.loginIdExists(loginId);
  }

  private AccountView create(
      String loginId, String password, String displayName, String email, String role) {
    String normalizedEmail = SignupRules.validate(loginId, password, displayName, email);
    try {
      return view(
          data.create(loginId, encoder.encode(password), displayName, normalizedEmail, role));
    } catch (DuplicateAccountDataException exception) {
      throw new DuplicateAccountException(exception);
    }
  }

  public void requireAdministrator(String loginId) {
    if (!"ADMIN".equals(current(loginId).role())) throw new AccountForbiddenException();
  }

  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public MemberView profile(String loginId) {
    requireActive(loginId);
    return memberView(data.member(loginId));
  }

  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public java.util.List<MemberView> managedMembers(String role, String query, int page) {
    if (!java.util.Set.of("BUYER", "SELLER").contains(role))
      throw new IllegalArgumentException("회원 역할을 확인해 주세요.");
    return data.members(role, query, page).stream().map(AccountService::memberView).toList();
  }

  @org.springframework.transaction.annotation.Transactional
  public MemberView registerSeller(
      String loginId, String password, String email, String contactName, String contactPhone) {
    // 별명을 별도로 받지 않는 신규 판매자 계정에만 내부 표시 이름을 사용한다.
    AccountView account = create(loginId, password, "판매자", email, "SELLER");
    data.sellerContact(account.id(), contactName, contactPhone, SignupRules.email(email));
    data.requirePasswordChange(account.id());
    return profile(loginId);
  }

  @org.springframework.transaction.annotation.Transactional
  public MemberView changeContact(long id, String name, String phone, String email) {
    MemberView before = lockMember(id);
    if (!before.role().equals("SELLER")) throw new IllegalArgumentException("판매자만 수정할 수 있습니다.");
    try {
      data.sellerContact(id, name, phone, SignupRules.email(email));
    } catch (org.springframework.dao.DuplicateKeyException exception) {
      throw new DuplicateAccountException(exception);
    }
    return profile(before.loginId());
  }

  public MemberView lockMember(long id) {
    return memberView(data.lockMember(id));
  }

  @org.springframework.transaction.annotation.Transactional
  public void changePassword(String loginId, String currentPassword, String newPassword) {
    MemberView account = profile(loginId);
    data.lockMember(account.id());
    var credentials = data.findByLoginId(loginId).orElseThrow();
    if (!credentials.hasLocalPassword()
        || currentPassword == null
        || !encoder.matches(currentPassword, credentials.passwordHash()))
      throw new IllegalArgumentException("현재 비밀번호가 올바르지 않습니다.");
    SignupRules.password(newPassword);
    if (encoder.matches(newPassword, credentials.passwordHash()))
      throw new IllegalArgumentException("새 비밀번호는 현재 비밀번호와 달라야 합니다.");
    data.password(account.id(), encoder.encode(newPassword));
    // 비밀번호 변경은 모든 기기의 기존 access/refresh를 이후 요청부터 거절한다.
    data.bumpAuthVersion(account.id());
  }

  @org.springframework.transaction.annotation.Transactional
  public void bootstrapAdministrator(String loginId, String password, String email) {
    var existing = data.findByLoginId(loginId);
    if (existing.isPresent()) {
      if (!existing.orElseThrow().role().equals("ADMIN"))
        throw new IllegalStateException("초기 관리자 ID가 기존 계정과 충돌합니다.");
      return;
    }
    create(loginId, password, "관리자", email, "ADMIN");
  }

  private static MemberView memberView(com.mirinae.market.modules.account.data.MemberRow row) {
    return new MemberView(
        row.id(),
        row.loginId(),
        row.displayName(),
        row.role(),
        row.email(),
        row.contactName(),
        row.contactPhone(),
        row.passwordChangeRequired());
  }

  public Optional<AccountCredentials> credentials(String loginId) {
    if (!data.active(loginId)) return Optional.empty();
    return data.findByLoginId(loginId)
        .filter(AccountRow::hasLocalPassword)
        .map(row -> new AccountCredentials(row.loginId(), row.passwordHash(), row.role()));
  }

  public AccountView current(String loginId) {
    requireActive(loginId);
    return data.findByLoginId(loginId)
        .map(this::view)
        .orElseThrow(() -> new IllegalArgumentException("계정을 찾을 수 없습니다."));
  }

  public AccountView ensureDemoAccount(
      String loginId, String password, String displayName, String email, String role) {
    Optional<AccountRow> existing = data.findByLoginId(loginId);
    if (existing.isPresent()) {
      AccountRow row = existing.orElseThrow();
      if (row.role().equals("BUYER") && role.equals("BUYER") && !data.active(loginId))
        return view(row);
      if (!row.role().equals(role)
          || !row.email().equals(email)
          || !row.hasLocalPassword()
          || !encoder.matches(password, row.passwordHash())) {
        throw new IllegalStateException("데모 ID가 기존 계정과 충돌합니다: " + loginId);
      }
      return view(row);
    }
    return create(loginId, password, displayName, email, role);
  }

  private AccountView view(AccountRow row) {
    return new AccountView(
        row.id(),
        row.loginId(),
        row.displayName(),
        row.role(),
        data.member(row.loginId()).passwordChangeRequired());
  }

  public boolean isActive(String loginId) {
    return data.active(loginId);
  }

  private void requireActive(String loginId) {
    if (!data.active(loginId)) throw new AccountInactiveException();
  }

  public void requireActiveBuyer(long id) {
    if (!data.activeBuyer(id)) throw new AccountInactiveException();
  }

  /**
   * 구매자 탈퇴의 본인 확인 단계다. 계정을 잠그고 활성 여부·역할·로컬 비밀번호를 검사하되 아직 어떤 상태도 바꾸지 않는다. 소셜 전용 계정은 비밀번호가 없으므로 별도의
   * 재인증 확인이 필요하다.
   */
  @org.springframework.transaction.annotation.Transactional
  public long verifyBuyerWithdrawal(String loginId, String password) {
    AccountView account = current(loginId);
    data.lockMember(account.id());
    requireActive(loginId);
    if (!account.role().equals("BUYER"))
      throw new org.springframework.security.access.AccessDeniedException("구매자만 탈퇴할 수 있습니다.");
    var credentials = data.findByLoginId(loginId).orElseThrow(AccountInactiveException::new);
    if (credentials.hasLocalPassword()) {
      if (password == null
          || password.isEmpty()
          || !encoder.matches(password, credentials.passwordHash()))
        throw new IllegalArgumentException("현재 비밀번호가 올바르지 않습니다.");
    }
    return account.id();
  }

  /** 탈퇴 확정 단계다. 개인정보를 정리하고 소셜 연결을 삭제하며 인증 버전을 올린다. */
  @org.springframework.transaction.annotation.Transactional
  public void deactivateBuyer(long accountId, java.time.Instant now) {
    data.removeIdentities(accountId);
    data.withdraw(
        accountId,
        encoder.encode(java.util.UUID.randomUUID().toString()),
        java.util.UUID.randomUUID() + "@example.invalid",
        now);
  }

  @Override
  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public Optional<AccountAuthentication> accountForAuthentication(String loginId) {
    return authLookup(() -> data.authByLoginId(loginId));
  }

  @Override
  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public Optional<AccountAuthentication> accountForAuthentication(long accountId) {
    return authLookup(() -> data.authById(accountId));
  }

  /** DB 장애를 인증 불가 예외로 변환해 401과 503을 구분한다. */
  private static Optional<AccountAuthentication> authLookup(
      java.util.function.Supplier<java.util.Optional<AccountAuthRow>> lookup) {
    try {
      return lookup.get().map(AccountService::authentication);
    } catch (com.mirinae.market.modules.account.data.AccountStorageUnavailableException exception) {
      throw new AccountUnavailableException(exception);
    }
  }

  private static AccountAuthentication authentication(AccountAuthRow row) {
    return new AccountAuthentication(
        row.id(), row.loginId(), row.role(), row.passwordHash(), row.active(), row.authVersion());
  }

  @Override
  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public List<String> linkedProviders(long accountId) {
    return data.identityProviders(accountId);
  }

  @Override
  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public Optional<Long> activeAccountIdByEmail(String email) {
    return data.activeAccountIdByEmail(SignupRules.email(email));
  }

  @Override
  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public Optional<Long> activeAccountIdByEmailOrEmpty(String email) {
    String normalized = SignupRules.optionalEmail(email);
    return normalized == null ? Optional.empty() : data.activeAccountIdByEmail(normalized);
  }

  @Override
  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public Optional<Long> activeAccountIdByIdentity(String provider, String subject) {
    return data.activeAccountIdByIdentity(provider, subject);
  }

  @Override
  @org.springframework.transaction.annotation.Transactional
  public void connectIdentity(
      long accountId, long expectedAuthVersion, String provider, String subject) {
    // 탈퇴·비밀번호 변경 경합에서 과거 증명으로 연결되지 않도록 잠금 후 현재 상태를 다시 확인한다.
    var locked = data.lockMember(accountId);
    if (locked.role() == null || !"BUYER".equals(locked.role())) {
      throw new AccountForbiddenException();
    }
    AccountAuthRow current = data.authById(accountId).orElseThrow(AccountInactiveException::new);
    if (!current.active()) throw new AccountInactiveException();
    if (current.authVersion() != expectedAuthVersion) {
      throw new AccountForbiddenException();
    }
    try {
      data.connectIdentity(accountId, provider, subject, java.time.Instant.now());
    } catch (DuplicateAccountDataException exception) {
      throw new DuplicateAccountException(exception);
    }
  }

  @Override
  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public boolean identityAvailable(String provider, String subject) {
    return data.activeAccountIdByIdentity(provider, subject).isEmpty();
  }

  @Override
  @org.springframework.transaction.annotation.Transactional
  public AccountAuthentication registerSocialBuyer(
      String displayName, String email, String provider, String subject) {
    SignupRules.displayName(displayName);
    String normalizedEmail = SignupRules.email(email);
    AccountAuthRow created;
    try {
      created = data.createSocial(socialLoginId(), displayName, normalizedEmail);
    } catch (DuplicateAccountDataException exception) {
      throw new DuplicateAccountException(exception);
    }
    try {
      data.connectIdentity(created.id(), provider, subject, java.time.Instant.now());
    } catch (DuplicateAccountDataException exception) {
      // 같은 소셜 신원의 동시 가입 경쟁은 한 연결만 남긴다. 이 트랜잭션이 만든 계정도 함께 롤백된다.
      throw new DuplicateAccountException(exception);
    }
    return authentication(created);
  }

  /** 소셜 내부 로그인 ID는 밑줄을 포함한 예약 영역이라 공개 가입 형식으로 선점할 수 없다. */
  private static String socialLoginId() {
    return "s_" + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 17);
  }

  @Override
  @org.springframework.transaction.annotation.Transactional
  public long bumpAuthVersion(long accountId) {
    return data.bumpAuthVersion(accountId);
  }

  @Override
  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public AccountSummary summary(String loginId) {
    AccountView account = current(loginId);
    return new AccountSummary(
        account.id(),
        account.loginId(),
        account.displayName(),
        account.role(),
        account.requiresPasswordChange());
  }

  @Override
  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public java.util.List<LinkedIdentity> linkedIdentities(long accountId) {
    return data.identityProviders(accountId).stream()
        .map(provider -> new LinkedIdentity(provider, data.identitySubject(accountId, provider)))
        .toList();
  }

  @Override
  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public boolean socialOnly(long accountId) {
    return data.authById(accountId)
        .map(row -> !row.hasLocalPassword())
        .orElseThrow(AccountInactiveException::new);
  }
}
