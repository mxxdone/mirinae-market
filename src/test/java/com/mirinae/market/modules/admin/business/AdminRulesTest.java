package com.mirinae.market.modules.admin.business;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class AdminRulesTest {
  @Test
  void acceptsNamesAndNormalizesContactPhone() {
    assertEquals("가", AdminRules.name("가"));
    assertEquals("가".repeat(100), AdminRules.name("가".repeat(100)));
    assertEquals("012345678", AdminRules.phone("012345678"));
    assertEquals(0, AdminRules.page(0));
    assertEquals(100000, AdminRules.page(100000));
    assertEquals("중앙시장", AdminRules.name(" 중앙시장 "));
    assertEquals("01012345678", AdminRules.phone("010-1234-5678"));
    assertEquals("0212345678", AdminRules.phone("02-1234-5678"));
  }

  @Test
  void rejectsMissingLongAndInvalidContacts() {
    assertThrows(IllegalArgumentException.class, () -> AdminRules.name(" "));
    assertThrows(IllegalArgumentException.class, () -> AdminRules.name("가".repeat(101)));
    assertThrows(IllegalArgumentException.class, () -> AdminRules.phone(null));
    assertThrows(IllegalArgumentException.class, () -> AdminRules.phone("abc01012345678"));
    assertThrows(IllegalArgumentException.class, () -> AdminRules.phone("123"));
    assertThrows(IllegalArgumentException.class, () -> AdminRules.page(-1));
    assertThrows(IllegalArgumentException.class, () -> AdminRules.page(100001));
    assertThrows(IllegalArgumentException.class, () -> AdminRules.name("가\n나"));
    assertThrows(IllegalArgumentException.class, () -> AdminRules.phone("010123456789"));
  }
}
