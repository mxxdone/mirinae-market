package com.mirinae.market.modules.admin.business;

final class AdminRules {
  private AdminRules() {}

  static String name(String value) {
    if (value == null
        || value.isBlank()
        || value.strip().length() > 100
        || value.chars().anyMatch(Character::isISOControl))
      throw new IllegalArgumentException("이름은 공백만으로 구성할 수 없으며 100자 이하여야 합니다.");
    return value.strip();
  }

  static String phone(String value) {
    if (value == null || !value.matches("[0-9 -]+"))
      throw new IllegalArgumentException("연락처는 국내 전화번호를 입력해 주세요.");
    String phone = value.replace("-", "").replace(" ", "");
    if (!phone.matches("0[0-9]{8,10}"))
      throw new IllegalArgumentException("연락처는 0으로 시작하는 9~11자리 전화번호여야 합니다.");
    return phone;
  }

  static int page(int page) {
    if (page < 0 || page > 100000) throw new IllegalArgumentException("페이지 범위가 올바르지 않습니다.");
    return page;
  }
}
