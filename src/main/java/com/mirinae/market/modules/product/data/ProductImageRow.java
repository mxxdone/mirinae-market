package com.mirinae.market.modules.product.data;

import java.time.Instant;

public record ProductImageRow(
    String id,
    long storeId,
    Long productId,
    String state,
    int width,
    int height,
    Instant deleteAfter) {}
