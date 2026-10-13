package com.mirinae.market.modules.product.presentation;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalTime;
import java.util.List;

public record SaleBatchRequest(
    @Schema(
            description = "매장 공통 주문 마감, HH:mm",
            example = "14:00",
            requiredMode = Schema.RequiredMode.REQUIRED)
        LocalTime orderDeadline,
    @Schema(
            description = "매장 공통 수령 시작, HH:mm",
            example = "15:00",
            requiredMode = Schema.RequiredMode.REQUIRED)
        LocalTime startTime,
    @Schema(
            description = "매장 공통 수령 마감, HH:mm",
            example = "19:00",
            requiredMode = Schema.RequiredMode.REQUIRED)
        LocalTime endTime,
    @Schema(
            description = "수정한 상품만 최대 100건. 미포함 상품은 유지. 빈 목록은 공통 시간만 변경",
            requiredMode = Schema.RequiredMode.REQUIRED)
        List<SaleChangeRequest> products) {}
