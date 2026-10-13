package com.mirinae.market.config;

import com.mirinae.market.modules.account.business.DuplicateAccountException;
import com.mirinae.market.modules.product.business.ProductConflictException;
import com.mirinae.market.modules.product.business.ProductNotFoundException;
import com.mirinae.market.modules.product.business.SaleBatchException;
import com.mirinae.market.modules.store.business.StoreForbiddenException;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(com.mirinae.market.modules.checkout.business.CheckoutConflictException.class)
  public ResponseEntity<Map<String, String>> checkoutConflict(
      com.mirinae.market.modules.checkout.business.CheckoutConflictException exception) {
    return ResponseEntity.status(409)
        .body(Map.of("code", exception.code(), "message", exception.getMessage()));
  }

  @ExceptionHandler(SaleBatchException.class)
  public ResponseEntity<Map<String, Object>> invalidSales(SaleBatchException exception) {
    return ResponseEntity.badRequest()
        .body(
            Map.of(
                "code",
                "SALE_BATCH_INVALID",
                "message",
                exception.getMessage(),
                "issues",
                exception.issues()));
  }

  @ExceptionHandler(ProductNotFoundException.class)
  public ResponseEntity<Map<String, String>> notFound(ProductNotFoundException exception) {
    return ResponseEntity.status(404)
        .body(Map.of("code", "NOT_FOUND", "message", exception.getMessage()));
  }

  @ExceptionHandler(ProductConflictException.class)
  public ResponseEntity<Map<String, String>> conflict(ProductConflictException exception) {
    return ResponseEntity.status(409)
        .body(Map.of("code", exception.code(), "message", exception.getMessage()));
  }

  @ExceptionHandler(MethodArgumentTypeMismatchException.class)
  public ResponseEntity<Map<String, String>> invalidParameter() {
    return ResponseEntity.badRequest()
        .body(Map.of("code", "INVALID_INPUT", "message", "경로와 조회 조건의 날짜·숫자 형식을 확인해 주세요."));
  }

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
