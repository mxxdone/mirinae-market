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
        Integer onlineQuantity) {}
