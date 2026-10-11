package com.mirinae.market.architecture.fixture.negative.modules.dataleak.business;

import static java.sql.DriverManager.getConnection;

import java.sql.SQLException;

/** static import로 JDBC 타입을 참조하는 위반 예시다. */
public class StaticImportJdbcLeak {

  public void leak(String url) throws SQLException {
    getConnection(url);
  }
}
