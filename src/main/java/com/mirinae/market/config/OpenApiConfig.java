package com.mirinae.market.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.PathItem;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import java.util.List;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI 보안 스킴은 Authorization Bearer access, X-CSRF-TOKEN 헤더, refresh HttpOnly 쿠키다.
 *
 * <p>Swagger/OpenAPI에서 security 배열의 서로 다른 항목은 OR이고, 한 항목 안의 스킴 나열은 AND다. 따라서 보호 mutation은 {@code
 * [{bearerAuth:[], csrfToken:[]}]} 한 항목으로 표현해야 실제 검사(둘 다 필요)와 일치한다. 기존 annotation이 만든 bearer/csrf
 * 분리 OR 배열은 customizer가 실제 보호 경로에서 일관되게 덮어쓴다.
 */
@Configuration
public class OpenApiConfig {
  private static final List<String> PUBLIC_AUTH_PREFIXES =
      List.of(
          "/api/auth/csrf",
          "/api/auth/login",
          "/api/auth/oauth/providers",
          "/api/auth/oauth/flow",
          "/api/auth/oauth/");

  @Bean
  public OpenAPI mirinaeMarketOpenApi() {
    return new OpenAPI()
        .info(
            new Info()
                .title("미리내 마켓 API")
                .description(
                    "전통시장 당일 예약 구매 서비스. 보호 요청에는 Authorization: Bearer access, 변경 요청에는 CSRF 토큰이 필요합니다.")
                .version("0.0.1"))
        .components(
            new Components()
                .addSecuritySchemes(
                    "bearerAuth",
                    new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")
                        .description("10분 유효한 서비스 access JWT. 메모리에만 보관합니다."))
                .addSecuritySchemes(
                    "csrfToken",
                    new SecurityScheme()
                        .type(SecurityScheme.Type.APIKEY)
                        .in(SecurityScheme.In.HEADER)
                        .name("X-CSRF-TOKEN")
                        .description("GET /api/auth/csrf의 token. HttpOnly CSRF 쿠키로 검증합니다."))
                .addSecuritySchemes(
                    "refreshCookie",
                    new SecurityScheme()
                        .type(SecurityScheme.Type.APIKEY)
                        .in(SecurityScheme.In.COOKIE)
                        .name("MIRINAE_REFRESH")
                        .description("HttpOnly refresh 쿠키. 회전·로그아웃에 사용합니다."))
                .addSchemas(
                    "ApiError",
                    new ObjectSchema()
                        .addProperty("code", new StringSchema())
                        .addProperty("message", new StringSchema().description("한국어 오류 설명"))));
  }

  /** 실제 보호 경로의 security를 Bearer+CSRF(AND) 한 항목으로 정규화하고 인증 엔드포인트를 문서화한다. */
  @Bean
  public OpenApiCustomizer authEndpoints() {
    return api -> {
      registerAuthOperations(api);
      if (api.getPaths() == null) return;
      api.getPaths()
          .forEach(
              (path, item) -> {
                if (!isProtectedBusinessPath(path)) return;
                item.readOperationsMap()
                    .forEach(
                        (method, operation) -> {
                          if (method == PathItem.HttpMethod.POST
                              || method == PathItem.HttpMethod.PUT
                              || method == PathItem.HttpMethod.PATCH
                              || method == PathItem.HttpMethod.DELETE) {
                            operation.security(List.of(bearerAndCsrf()));
                          } else {
                            operation.security(List.of(bearerOnly()));
                          }
                        });
              });
    };
  }

  /** 실제 업무 보호 경로다. /api/auth 계열은 별도 규칙을 쓴다. */
  private static boolean isProtectedBusinessPath(String path) {
    return path.startsWith("/api/buyer/")
        || path.startsWith("/api/admin/")
        || path.startsWith("/api/seller/")
        || path.equals("/api/seller")
        || PUBLIC_AUTH_PREFIXES.stream().noneMatch(path::startsWith)
            && path.startsWith("/api/")
            && !path.equals("/api/accounts")
            && !path.equals("/api/accounts/login-id-availability")
            && !path.startsWith("/api/markets");
  }

  private static void registerAuthOperations(io.swagger.v3.oas.models.OpenAPI api) {
    if (api.getPaths() == null) return;
    setSecurity(api, "/api/auth/me", "get", List.of(bearerOnly()));
    setSecurity(api, "/api/auth/csrf", "get", null);
    setSecurity(api, "/api/auth/refresh", "post", List.of(refreshAndCsrf()));
    setSecurity(api, "/api/auth/logout", "post", List.of(csrfOnly()));
    setSecurity(api, "/api/auth/oauth/providers", "get", null);
    setSecurity(api, "/api/auth/oauth/flow", "get", null);
  }

  private static void setSecurity(
      io.swagger.v3.oas.models.OpenAPI api,
      String path,
      String method,
      List<SecurityRequirement> requirements) {
    PathItem item = api.getPaths().get(path);
    if (item == null) return;
    Operation operation =
        item.readOperationsMap().get(PathItem.HttpMethod.valueOf(method.toUpperCase()));
    if (operation == null) return;
    operation.security(requirements);
  }

  private static SecurityRequirement bearerAndCsrf() {
    return new SecurityRequirement().addList("bearerAuth").addList("csrfToken");
  }

  private static SecurityRequirement bearerOnly() {
    return new SecurityRequirement().addList("bearerAuth");
  }

  private static SecurityRequirement csrfOnly() {
    return new SecurityRequirement().addList("csrfToken");
  }

  private static SecurityRequirement refreshAndCsrf() {
    return new SecurityRequirement().addList("refreshCookie").addList("csrfToken");
  }
}
