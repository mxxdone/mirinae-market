package com.mirinae.market.modules.account.presentation;

import io.swagger.v3.oas.annotations.media.Schema;

public record SignupRequest(
    @Schema(
            description = "5~20자의 영문 소문자·숫자·밑줄·하이픈",
            example = "buyer01",
            minLength = 5,
            maxLength = 20,
            pattern = "^[a-z0-9_-]{5,20}$",
            requiredMode = Schema.RequiredMode.REQUIRED)
        String loginId,
    @Schema(
            description = "8~32자의 영문·숫자·특수문자 모두 포함",
            format = "password",
            minLength = 8,
            maxLength = 32,
            requiredMode = Schema.RequiredMode.REQUIRED,
            accessMode = Schema.AccessMode.WRITE_ONLY)
        String password,
    @Schema(
            description = "2~10자의 완성형 한글·영문·숫자",
            example = "시장손님",
            minLength = 2,
            maxLength = 10,
            requiredMode = Schema.RequiredMode.REQUIRED)
        String displayName,
    @Schema(
            description = "필수 ASCII 이메일. 앞뒤 공백 제거·소문자화 후 저장. 소유 확인은 제공하지 않음",
            example = "buyer@example.com",
            maxLength = 254,
            requiredMode = Schema.RequiredMode.REQUIRED)
        String email) {}
