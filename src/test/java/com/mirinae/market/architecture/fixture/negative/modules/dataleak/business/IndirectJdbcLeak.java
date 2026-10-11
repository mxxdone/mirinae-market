package com.mirinae.market.architecture.fixture.negative.modules.dataleak.business;

import com.mirinae.market.architecture.fixture.negative.modules.dataleak.data.ConnectionProvider;

/** 중간 타입(Data의 getter 반환형)을 경유해 JDBC 타입을 사용하는 위반 예시다. */
public class IndirectJdbcLeak {

  private final ConnectionProvider provider = new ConnectionProvider();

  public void leak() throws java.sql.SQLException {
    provider.connection().createStatement();
  }
}
