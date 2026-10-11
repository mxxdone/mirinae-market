package com.mirinae.market.architecture.fixture.negative.modules.sdkleak.business;

import java.net.http.HttpClient;

/** Data 밖에서 JDK HTTP 클라이언트를 참조하는 위반 예시다. */
public class HttpClientLeak {

  private final HttpClient client = HttpClient.newHttpClient();

  public HttpClient client() {
    return client;
  }
}
