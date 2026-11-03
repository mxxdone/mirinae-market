package com.mirinae.market.modules.product.business;

import com.mirinae.market.modules.product.data.ProductData;
import com.mirinae.market.modules.product.data.ProductImageData;
import com.mirinae.market.modules.product.data.ProductImageFiles;
import com.mirinae.market.modules.product.data.ProductImageRow;
import com.mirinae.market.modules.store.business.StoreService;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ProductImageService {
  private final ProductImageData data;
  private final ProductImageFiles files;
  private final ProductData products;
  private final StoreService stores;
  private final Clock clock;
  private final Semaphore processing = new Semaphore(2);

  public ProductImageService(
      ProductImageData data,
      ProductImageFiles files,
      ProductData products,
      StoreService stores,
      Clock clock) {
    this.data = data;
    this.files = files;
    this.products = products;
    this.stores = stores;
    this.clock = clock;
  }

  @Transactional
  public ProductImageView upload(String actor, long store, byte[] bytes) {
    stores.ownedStore(actor, store);
    ProductImageRules.validate(1, 1, bytes.length);
    if (!processing.tryAcquire())
      throw new ProductConflictException("IMAGE_BUSY", "사진 처리 중입니다. 잠시 후 다시 시도해 주세요.");
    try {
      int[] size = files.dimensions(bytes);
      ProductImageRules.validate(size[0], size[1], bytes.length);
      String id = UUID.randomUUID().toString();
      int[] oriented = files.store(id, bytes);
      var now = clock.instant();
      data.stage(id, store, oriented[0], oriented[1], now, now.plus(Duration.ofHours(24)));
      return view(data.lock(id).orElseThrow());
    } finally {
      processing.release();
    }
  }

  public ProductImageView current(String actor, long store, long product) {
    stores.ownedStore(actor, store);
    products.product(store, product).orElseThrow(ProductNotFoundException::new);
    return data.current(product).map(ProductImageService::view).orElse(null);
  }

  public record PublicImage(long productId, ProductImageView image) {}

  public List<PublicImage> publicImages(long market, List<Long> ids) {
    if (ids == null
        || ids.isEmpty()
        || ids.size() > 100
        || ids.stream().anyMatch(id -> id == null || id < 1))
      throw new IllegalArgumentException("상품 ID는 양수 1~100개여야 합니다.");
    return data.publicImages(market, ids.stream().distinct().toList()).stream()
        .map(row -> new PublicImage(row.productId(), view(row)))
        .toList();
  }

  @Transactional
  public void change(long store, long product, String imageId) {
    if (imageId == null) return;
    if (imageId.isEmpty()) {
      retire(product);
      return;
    }
    String key = ProductImageRules.key(imageId);
    var row =
        data.lock(key)
            .orElseThrow(
                () ->
                    new ProductConflictException(
                        "IMAGE_UNAVAILABLE", "사진 업로드가 만료됐습니다. 다시 선택해 주세요."));
    if (row.storeId() != store) throw new ProductImageForbiddenException();
    if (row.state().equals("ACTIVE") && row.productId() != null && row.productId() == product)
      return;
    if (!row.state().equals("STAGED") || !row.deleteAfter().isAfter(clock.instant()))
      throw new ProductConflictException("IMAGE_UNAVAILABLE", "연결할 수 없는 사진입니다. 다시 선택해 주세요.");
    retire(product);
    data.attach(key, product);
  }

  @Transactional
  public void retire(long product) {
    data.retire(product, clock.instant().plus(Duration.ofHours(24)));
  }

  public byte[] content(String id, int edge) {
    ProductImageRules.key(id);
    if (edge != 256 && edge != 768 && edge != 1600) throw new ProductNotFoundException();
    if (!data.exists(id)) throw new ProductNotFoundException();
    byte[] bytes = files.read(id, edge);
    if (bytes == null) throw new ProductNotFoundException();
    return bytes;
  }

  @Transactional
  public int cleanUnused() {
    int count = 0;
    for (var row : data.due(clock.instant())) {
      files.delete(row.id());
      data.remove(row.id());
      count++;
    }
    for (String id : files.staleFolders(clock.instant().minus(Duration.ofHours(24)))) {
      if (!data.exists(id)) {
        files.delete(id);
        count++;
      }
    }
    return count;
  }

  private static ProductImageView view(ProductImageRow row) {
    return new ProductImageView(
        row.id(),
        java.util.stream.Stream.of(256, 768, 1600)
            .map(
                edge -> {
                  var size = ProductImageRules.scaled(row.width(), row.height(), edge);
                  return new ProductImageView.Variant(
                      edge, size[0], size[1], "/media/products/" + row.id() + "/" + edge + ".jpg");
                })
            .toList());
  }
}
