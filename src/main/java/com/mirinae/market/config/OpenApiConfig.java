package com.mirinae.market.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** OpenAPI 문서의 제목과 설명을 정의한다. */
@Configuration
public class OpenApiConfig {
  /** 미리내 마켓 API 문서 정보를 생성한다. */
  @Bean
  public OpenAPI mirinaeMarketOpenApi() {
    return new OpenAPI()
        .info(
            new Info()
                .title("미리내 마켓 API")
                .description("전통시장 전날 예약 구매 서비스의 백엔드 API 문서이다.")
                .version("0.0.1"));
  }
}
