package com.mirinae.market.modules.checkout.business;

public record RefundAttempt(long id, long amountWon, String mode, int attempt, String token) {}
