package com.mirinae.market.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.PathItem;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.BooleanSchema;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.parameters.RequestBody;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import java.util.List;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {
  @Bean
  public OpenAPI mirinaeMarketOpenApi() {
    return new OpenAPI()
        .info(
            new Info()
                .title("미리내 마켓 API")
                .description("전통시장 전날 예약 구매 서비스. 변경 요청에는 세션 쿠키와 CSRF 토큰이 필요합니다.")
                .version("0.0.1"))
        .components(
            new Components()
                .addSecuritySchemes(
                    "sessionCookie",
                    new SecurityScheme()
                        .type(SecurityScheme.Type.APIKEY)
                        .in(SecurityScheme.In.COOKIE)
                        .name("JSESSIONID")
                        .description("CSRF 조회·로그인으로 발급한 세션 쿠키"))
                .addSecuritySchemes(
                    "csrfToken",
                    new SecurityScheme()
                        .type(SecurityScheme.Type.APIKEY)
                        .in(SecurityScheme.In.HEADER)
                        .name("X-CSRF-TOKEN")
                        .description("GET /api/auth/csrf의 token. 로그인·로그아웃 후 재조회"))
                .addSchemas(
                    "ApiError",
                    new ObjectSchema()
                        .addProperty("code", new StringSchema())
                        .addProperty("message", new StringSchema().description("한국어 오류 설명"))));
  }

  /** 보안 필터가 처리하는 로그인·로그아웃도 실제 요청·응답 계약으로 문서화한다. */
  @Bean
  public OpenApiCustomizer sessionEndpoints() {
    return api -> {
      ObjectSchema loginBody = new ObjectSchema();
      loginBody.addProperty("loginId", new StringSchema().description("로그인 ID"));
      loginBody.addProperty("password", new StringSchema().format("password").description("비밀번호"));
      loginBody.required(List.of("loginId", "password"));
      Operation login =
          new Operation()
              .summary("세션 로그인")
              .description("폼 데이터로 인증합니다. 성공 시 세션 ID와 CSRF 토큰을 교체하므로 CSRF를 다시 조회합니다.")
              .security(List.of(csrfSecurity()))
              .requestBody(
                  new RequestBody()
                      .required(true)
                      .content(
                          new Content()
                              .addMediaType(
                                  "application/x-www-form-urlencoded",
                                  new MediaType().schema(loginBody))))
              .responses(
                  new ApiResponses()
                      .addApiResponse(
                          "200",
                          new ApiResponse()
                              .description("로그인 완료")
                              .content(
                                  new Content()
                                      .addMediaType(
                                          "application/json",
                                          new MediaType()
                                              .schema(
                                                  new ObjectSchema()
                                                      .addProperty(
                                                          "authenticated", new BooleanSchema())))))
                      .addApiResponse("401", errorResponse("ID 또는 비밀번호 오류: INVALID_CREDENTIALS"))
                      .addApiResponse("403", errorResponse("CSRF 토큰 누락·불일치: FORBIDDEN")));
      Operation logout =
          new Operation()
              .summary("세션 로그아웃")
              .description("세션 무효화와 JSESSIONID 쿠키 삭제. 이후 CSRF 토큰을 다시 조회합니다.")
              .security(List.of(csrfSecurity()))
              .responses(
                  new ApiResponses()
                      .addApiResponse("204", new ApiResponse().description("로그아웃 완료"))
                      .addApiResponse("403", errorResponse("CSRF 토큰 누락·불일치: FORBIDDEN")));
      api.path("/api/auth/login", new PathItem().post(login));
      api.path("/api/auth/logout", new PathItem().post(logout));
      api.getPaths().get("/api/accounts").getPost().security(List.of(csrfSecurity()));
      api.getPaths()
          .get("/api/auth/me")
          .getGet()
          .security(List.of(new SecurityRequirement().addList("sessionCookie")));
      api.getPaths()
          .get("/api/seller/stores/{storeId}")
          .getGet()
          .security(List.of(new SecurityRequirement().addList("sessionCookie")));
    };
  }

  private static SecurityRequirement csrfSecurity() {
    return new SecurityRequirement().addList("sessionCookie").addList("csrfToken");
  }

  private static ApiResponse errorResponse(String description) {
    return new ApiResponse()
        .description(description)
        .content(
            new Content()
                .addMediaType(
                    "application/json",
                    new MediaType().schema(new Schema<>().$ref("#/components/schemas/ApiError"))));
  }
}
