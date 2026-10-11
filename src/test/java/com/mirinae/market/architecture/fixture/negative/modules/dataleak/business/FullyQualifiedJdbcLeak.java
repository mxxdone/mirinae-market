package com.mirinae.market.architecture.fixture.negative.modules.dataleak.business;

/** import 없이 정규화 이름으로 JDBC 타입을 참조하는 위반 예시다. */
public class FullyQualifiedJdbcLeak {

  private final java.sql.Connection connection = null;

  public java.sql.Connection connection() {
    return connection;
  }
}
