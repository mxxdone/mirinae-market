package com.mirinae.market.modules.checkout.data;

import java.time.Instant;

public record StatementRow(long id, long totalWon, Instant confirmedAt) {}
