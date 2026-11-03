package com.mirinae.market.modules.account.business;

import com.mirinae.market.modules.account.data.AccountData;
import com.mirinae.market.modules.account.data.AccountRow;
import com.mirinae.market.modules.account.data.DuplicateAccountDataException;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AccountService {
  private final AccountData data;
  private final PasswordEncoder encoder;

  public AccountService(AccountData data, PasswordEncoder encoder) {
    this.data = data;
    this.encoder = encoder;
  }

  public AccountView signup(String loginId, String password, String displayName, String email) {
    return create(loginId, password, displayName, email, "BUYER");
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
    if (currentPassword == null || !encoder.matches(currentPassword, credentials.passwordHash()))
      throw new IllegalArgumentException("현재 비밀번호가 올바르지 않습니다.");
    SignupRules.password(newPassword);
    if (encoder.matches(newPassword, credentials.passwordHash()))
      throw new IllegalArgumentException("새 비밀번호는 현재 비밀번호와 달라야 합니다.");
    data.password(account.id(), encoder.encode(newPassword));
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
    return data.findByLoginId(loginId)
        .map(row -> new AccountCredentials(row.loginId(), row.passwordHash(), row.role()));
  }

  public AccountView current(String loginId) {
    return data.findByLoginId(loginId)
        .map(this::view)
        .orElseThrow(() -> new IllegalArgumentException("계정을 찾을 수 없습니다."));
  }

  public AccountView ensureDemoAccount(
      String loginId, String password, String displayName, String email, String role) {
    Optional<AccountRow> existing = data.findByLoginId(loginId);
    if (existing.isPresent()) {
      AccountRow row = existing.orElseThrow();
      if (!row.role().equals(role)
          || !row.email().equals(email)
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
}
