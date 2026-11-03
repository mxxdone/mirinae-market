package com.mirinae.market.modules.product.data;

import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class ProductImageFiles {
  private final Path root;

  public ProductImageFiles(
      @Value("${product.images.root:.local/uploads/product-images}") String root) {
    this.root = Path.of(root).toAbsolutePath().normalize();
  }

  public int[] dimensions(byte[] bytes) {
    try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
      var readers = ImageIO.getImageReaders(input);
      if (!readers.hasNext()) throw new IllegalArgumentException("JPG 또는 PNG 사진을 선택해 주세요.");
      var reader = readers.next();
      try {
        String format = reader.getFormatName();
        if (!format.equalsIgnoreCase("JPEG") && !format.equalsIgnoreCase("PNG"))
          throw new IllegalArgumentException("JPG 또는 PNG만 지원합니다.");
        reader.setInput(input);
        return new int[] {reader.getWidth(0), reader.getHeight(0)};
      } finally {
        reader.dispose();
      }
    } catch (IOException failure) {
      throw new IllegalArgumentException("손상된 이미지 파일입니다.", failure);
    }
  }

  public int[] store(String id, byte[] bytes) {
    BufferedImage source;
    try {
      source = ImageIO.read(new ByteArrayInputStream(bytes));
    } catch (IOException failure) {
      throw new IllegalArgumentException("사진을 읽을 수 없습니다.", failure);
    }
    if (source == null) throw new IllegalArgumentException("사진을 읽을 수 없습니다.");
    var oriented = orient(source, orientation(bytes));
    try {
      Path folder = folder(id);
      Files.createDirectories(folder);
      for (int edge : new int[] {256, 768, 1600}) {
        double factor =
            Math.min(1.0, (double) edge / Math.max(oriented.getWidth(), oriented.getHeight()));
        int width = Math.max(1, (int) Math.round(oriented.getWidth() * factor));
        int height = Math.max(1, (int) Math.round(oriented.getHeight() * factor));
        var target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        var graphics = target.createGraphics();
        try {
          graphics.setColor(Color.WHITE);
          graphics.fillRect(0, 0, width, height);
          graphics.setRenderingHint(
              RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
          graphics.drawImage(oriented, 0, 0, width, height, null);
        } finally {
          graphics.dispose();
        }
        var writer = ImageIO.getImageWritersByFormatName("JPEG").next();
        try (var output = ImageIO.createImageOutputStream(folder.resolve(edge + ".jpg").toFile())) {
          writer.setOutput(output);
          var params = writer.getDefaultWriteParam();
          params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
          params.setCompressionQuality(.85f);
          writer.write(null, new javax.imageio.IIOImage(target, null, null), params);
        } finally {
          writer.dispose();
        }
      }
      return new int[] {oriented.getWidth(), oriented.getHeight()};
    } catch (IOException failure) {
      throw new UncheckedIOException(failure);
    }
  }

  public byte[] read(String id, int edge) {
    try {
      return Files.readAllBytes(folder(id).resolve(edge + ".jpg"));
    } catch (java.nio.file.NoSuchFileException missing) {
      return null;
    } catch (IOException failure) {
      throw new UncheckedIOException(failure);
    }
  }

  public void delete(String id) {
    Path folder = folder(id);
    try {
      for (int edge : new int[] {256, 768, 1600})
        Files.deleteIfExists(folder.resolve(edge + ".jpg"));
      Files.deleteIfExists(folder);
    } catch (IOException failure) {
      throw new UncheckedIOException(failure);
    }
  }

  public List<String> staleFolders(Instant before) {
    if (!Files.isDirectory(root)) return List.of();
    try (var paths = Files.list(root)) {
      return paths
          .filter(
              path ->
                  Files.isDirectory(path) && path.getFileName().toString().matches("[0-9a-f-]{36}"))
          .filter(path -> modifiedBefore(path, before))
          .map(path -> path.getFileName().toString())
          .toList();
    } catch (IOException failure) {
      throw new UncheckedIOException(failure);
    }
  }

  private static boolean modifiedBefore(Path path, Instant before) {
    try {
      return Files.getLastModifiedTime(path).toInstant().isBefore(before);
    } catch (IOException failure) {
      throw new UncheckedIOException(failure);
    }
  }

  private Path folder(String id) {
    if (!java.util.UUID.fromString(id).toString().equals(id))
      throw new IllegalArgumentException("잘못된 사진 ID입니다.");
    return root.resolve(id);
  }

  private static BufferedImage orient(BufferedImage source, int value) {
    int w = source.getWidth(), h = source.getHeight();
    var result =
        new BufferedImage(value >= 5 ? h : w, value >= 5 ? w : h, BufferedImage.TYPE_INT_RGB);
    var transform =
        switch (value) {
          case 2 -> new AffineTransform(-1, 0, 0, 1, w, 0);
          case 3 -> new AffineTransform(-1, 0, 0, -1, w, h);
          case 4 -> new AffineTransform(1, 0, 0, -1, 0, h);
          case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);
          case 6 -> new AffineTransform(0, 1, -1, 0, h, 0);
          case 7 -> new AffineTransform(0, -1, -1, 0, h, w);
          case 8 -> new AffineTransform(0, -1, 1, 0, 0, w);
          default -> new AffineTransform();
        };
    var graphics = result.createGraphics();
    try {
      graphics.setColor(Color.WHITE);
      graphics.fillRect(0, 0, result.getWidth(), result.getHeight());
      graphics.drawImage(source, transform, null);
    } finally {
      graphics.dispose();
    }
    return result;
  }

  private static int orientation(byte[] bytes) {
    if (bytes.length < 4 || (bytes[0] & 255) != 255 || (bytes[1] & 255) != 216) return 1;
    int cursor = 2;
    while (cursor + 4 <= bytes.length && (bytes[cursor] & 255) == 255) {
      int marker = bytes[cursor + 1] & 255;
      if (marker == 218 || marker == 217) break;
      int length = ((bytes[cursor + 2] & 255) << 8) | (bytes[cursor + 3] & 255);
      if (length < 2 || cursor + 2 + length > bytes.length) break;
      if (marker == 225
          && length >= 16
          && bytes[cursor + 4] == 'E'
          && bytes[cursor + 5] == 'x'
          && bytes[cursor + 6] == 'i'
          && bytes[cursor + 7] == 'f') {
        return exifOrientation(ByteBuffer.wrap(bytes, cursor + 10, length - 8).slice());
      }
      cursor += 2 + length;
    }
    return 1;
  }

  private static int exifOrientation(ByteBuffer buffer) {
    if (buffer.remaining() < 8) return 1;
    short order = buffer.getShort(0);
    if (order != (short) 0x4949 && order != (short) 0x4d4d) return 1;
    buffer.order(order == (short) 0x4949 ? ByteOrder.LITTLE_ENDIAN : ByteOrder.BIG_ENDIAN);
    int offset = buffer.getInt(4);
    if (offset < 8 || offset > buffer.limit() - 2) return 1;
    int count = Short.toUnsignedInt(buffer.getShort(offset));
    for (int n = 0; n < count; n++) {
      long position = (long) offset + 2 + 12L * n;
      if (position > buffer.limit() - 12) break;
      int at = (int) position;
      if (Short.toUnsignedInt(buffer.getShort(at)) == 274
          && buffer.getShort(at + 2) == 3
          && buffer.getInt(at + 4) == 1) {
        int value = Short.toUnsignedInt(buffer.getShort(at + 8));
        return value >= 1 && value <= 8 ? value : 1;
      }
    }
    return 1;
  }
}
