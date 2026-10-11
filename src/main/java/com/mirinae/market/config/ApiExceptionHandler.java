package com.mirinae.market.config;

import com.mirinae.market.modules.account.business.DuplicateAccountException;
import com.mirinae.market.modules.store.business.StoreForbiddenException;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(DuplicateAccountException.class)
  public ResponseEntity<Map<String, String>> duplicate(DuplicateAccountException exception) {
    return ResponseEntity.status(409)
        .body(Map.of("code", "DUPLICATE_ACCOUNT", "message", exception.getMessage()));
  }

  @ExceptionHandler(StoreForbiddenException.class)
  public ResponseEntity<Map<String, String>> forbidden(StoreForbiddenException exception) {
    return ResponseEntity.status(403)
        .body(Map.of("code", "FORBIDDEN", "message", exception.getMessage()));
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<Map<String, String>> invalid(IllegalArgumentException exception) {
    return ResponseEntity.badRequest()
        .body(Map.of("code", "INVALID_INPUT", "message", exception.getMessage()));
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  public ResponseEntity<Map<String, String>> unreadable() {
    return ResponseEntity.badRequest()
        .body(Map.of("code", "INVALID_INPUT", "message", "올바른 JSON 요청을 전송해 주세요."));
  }
}
