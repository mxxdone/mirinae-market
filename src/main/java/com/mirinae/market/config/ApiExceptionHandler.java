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
  @ExceptionHandler(com.mirinae.market.modules.account.business.AccountInactiveException.class)
  public ResponseEntity<Map<String, String>> inactiveAccount(RuntimeException exception) {
    return ResponseEntity.status(401)
        .body(Map.of("code", "UNAUTHENTICATED", "message", exception.getMessage()));
  }

  @ExceptionHandler(
      com.mirinae.market.modules.product.business.ProductImageForbiddenException.class)
  public ResponseEntity<Map<String, String>> imageForbidden(RuntimeException exception) {
    return ResponseEntity.status(403)
        .body(Map.of("code", "FORBIDDEN", "message", exception.getMessage()));
  }

  @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
  public ResponseEntity<Map<String, String>> imageTooLarge(RuntimeException exception) {
    return ResponseEntity.status(413)
        .body(Map.of("code", "IMAGE_TOO_LARGE", "message", "사진은 최대 5MiB까지 등록할 수 있습니다."));
  }

  @ExceptionHandler({java.io.UncheckedIOException.class, java.io.IOException.class})
  public ResponseEntity<Map<String, String>> imageStorage(Exception exception) {
    return ResponseEntity.status(503)
        .body(
            Map.of(
                "code",
                "IMAGE_STORAGE_UNAVAILABLE",
                "message",
                "사진 저장소를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요."));
  }

  @ExceptionHandler(com.mirinae.market.modules.review.business.ReviewNotFoundException.class)
  public ResponseEntity<Map<String, String>> reviewNotFound(
      com.mirinae.market.modules.review.business.ReviewNotFoundException exception) {
    return ResponseEntity.status(404)
        .body(Map.of("code", "NOT_FOUND", "message", exception.getMessage()));
  }

  @ExceptionHandler(com.mirinae.market.modules.review.business.ReviewConflictException.class)
  public ResponseEntity<Map<String, String>> reviewConflict(
      com.mirinae.market.modules.review.business.ReviewConflictException exception) {
    return ResponseEntity.status(409)
        .body(Map.of("code", "REVIEW_STATE_CONFLICT", "message", exception.getMessage()));
  }

  @ExceptionHandler(com.mirinae.market.modules.store.business.StoreNotFoundException.class)
  public ResponseEntity<Map<String, String>> storeNotFound(
      com.mirinae.market.modules.store.business.StoreNotFoundException exception) {
    return ResponseEntity.status(404)
        .body(Map.of("code", "NOT_FOUND", "message", exception.getMessage()));
  }

  @ExceptionHandler(com.mirinae.market.modules.store.business.StoreOperationConflictException.class)
  public ResponseEntity<Map<String, String>> storeOperationConflict(
      com.mirinae.market.modules.store.business.StoreOperationConflictException exception) {
    return ResponseEntity.status(409)
        .body(Map.of("code", "REPORT_STATE_CONFLICT", "message", exception.getMessage()));
  }

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

  @ExceptionHandler(com.mirinae.market.modules.account.business.AccountForbiddenException.class)
  public ResponseEntity<Map<String, String>> accountForbidden() {
    return ResponseEntity.status(403)
        .body(Map.of("code", "FORBIDDEN", "message", "관리자 권한이 필요합니다."));
  }

  @ExceptionHandler(org.springframework.dao.DuplicateKeyException.class)
  public ResponseEntity<Map<String, String>> duplicateKey() {
    return ResponseEntity.status(409)
        .body(Map.of("code", "DUPLICATE_RESOURCE", "message", "이미 등록된 이름 또는 계정 정보입니다."));
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
