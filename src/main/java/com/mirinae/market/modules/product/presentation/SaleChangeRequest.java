package com.mirinae.market.modules.product.presentation;

import io.swagger.v3.oas.annotations.media.Schema;

public record SaleChangeRequest(
    @Schema(description = "변경할 본인 상품 ID", requiredMode = Schema.RequiredMode.REQUIRED)
        Long productId,
    @Schema(
            description = "오늘 판매 여부. false는 상품·판매 이력을 보존하는 판매 중단",
            requiredMode = Schema.RequiredMode.REQUIRED)
        Boolean selling,
    @Schema(description = "판매할 때 필수인 양의 정수 포장 가격(원). 중단 시 기존 값을 보존") Integer priceWon,
    @Schema(description = "판매할 때 필수인 0 이상 포장 수량. 0은 공개된 품절 상태") Integer onlineQuantity) {}
