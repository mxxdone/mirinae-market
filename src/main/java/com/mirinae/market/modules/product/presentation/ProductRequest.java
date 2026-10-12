package com.mirinae.market.modules.product.presentation;

import io.swagger.v3.oas.annotations.media.Schema;

public record ProductRequest(
    @Schema(
            description = "자유 상품명. 앞뒤 공백 제거 후 1~100자",
            example = "국내산 양파 3kg",
            requiredMode = Schema.RequiredMode.REQUIRED)
        String name,
    @Schema(description = "선택 설명, 최대 1,000자") String description,
    @Schema(
            description = "중량 또는 개수 방식",
            allowableValues = {"WEIGHT", "COUNT"},
            requiredMode = Schema.RequiredMode.REQUIRED)
        String unitType,
    @Schema(
            description = "정수 판매 구성. WEIGHT는 g(100g 배수), COUNT는 개수. 상품명에서 추출하지 않음",
            example = "3000",
            requiredMode = Schema.RequiredMode.REQUIRED)
        Integer unitAmount) {}
