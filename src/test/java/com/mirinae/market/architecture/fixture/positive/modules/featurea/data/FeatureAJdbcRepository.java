package com.mirinae.market.architecture.fixture.positive.modules.featurea.data;

/** Data 계층은 JDBC 타입을 사용할 수 있음을 보이는 양성 예시다. */
public class FeatureAJdbcRepository {

  private final java.sql.Connection connection = null;

  public boolean isConnected() {
    return connection != null;
  }
}
