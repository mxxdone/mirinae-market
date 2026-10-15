package com.mirinae.market.modules.product.presentation;

import io.swagger.v3.oas.annotations.media.Schema;

public record OfferRequest(
    @Schema(
            description = "한 판매 단위의 가격, 1~2,147,483,647 정수 원",
            example = "9000",
            requiredMode = Schema.RequiredMode.REQUIRED)
        Integer priceWon,
    @Schema(
            description = "온라인 판매 단위 수량, 0~2,147,483,647 정수. 0은 품절",
            example = "20",
            requiredMode = Schema.RequiredMode.REQUIRED)
        Integer onlineQuantity,
    @Schema(description = "조회한 재고 버전. 기존 판매 수량 변경에 필수이며 오래된 버전은 409로 전체 미적용합니다. 최초 판매 등록은 null")
        Long inventoryVersion) {}
