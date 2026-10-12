package com.mirinae.market.modules.product.presentation;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalTime;

public record PickupWindowRequest(
    @Schema(
            description = "같은 날 분 단위 수령 시작",
            type = "string",
            example = "14:00",
            requiredMode = Schema.RequiredMode.REQUIRED)
        LocalTime startTime,
    @Schema(
            description = "시작보다 늦은 같은 날 수령 마감",
            type = "string",
            example = "18:00",
            requiredMode = Schema.RequiredMode.REQUIRED)
        LocalTime endTime,
    @Schema(
            description = "분 단위 주문 마감. 수령 시작보다 늦을 수 없으며 정각부터 신규 주문을 받지 않습니다.",
            type = "string",
            example = "13:00",
            requiredMode = Schema.RequiredMode.REQUIRED)
        LocalTime orderDeadline) {}
