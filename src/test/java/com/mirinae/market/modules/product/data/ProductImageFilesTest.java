package com.mirinae.market.modules.product.data;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Path;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ProductImageFilesTest {
  @TempDir Path folder;

  private static byte[] image(int width, int height, String format) throws Exception {
    var result = new ByteArrayOutputStream();
    ImageIO.write(
        new BufferedImage(
            width,
            height,
            format.equals("PNG") ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB),
        format,
        result);
    return result.toByteArray();
  }

  @Test
  void preservesRatioNeverEnlargesAndFlattensTransparency() throws Exception {
    var files = new ProductImageFiles(folder.toString());
    String id = UUID.randomUUID().toString();
    files.store(id, image(1000, 500, "PNG"));
    for (int[] expected : new int[][] {{256, 256, 128}, {768, 768, 384}, {1600, 1000, 500}}) {
      var result = ImageIO.read(new ByteArrayInputStream(files.read(id, expected[0])));
      assertThat(result.getWidth()).isEqualTo(expected[1]);
      assertThat(result.getHeight()).isEqualTo(expected[2]);
      assertThat(result.getRGB(0, 0) & 0xffffff).isEqualTo(0xffffff);
    }
    assertThatIllegalArgumentException().isThrownBy(() -> files.dimensions(new byte[] {1, 2, 3}));
  }

  @Test
  void rotatesExifBeforeResizingAndDropsMetadata() throws Exception {
    byte[] jpeg = image(20, 10, "JPEG");
    var tiff = ByteBuffer.allocate(26).order(ByteOrder.LITTLE_ENDIAN);
    tiff.putShort((short) 0x4949).putShort((short) 42).putInt(8).putShort((short) 1);
    tiff.putShort((short) 274)
        .putShort((short) 3)
        .putInt(1)
        .putShort((short) 6)
        .putShort((short) 0)
        .putInt(0);
    var combined = new ByteArrayOutputStream();
    combined.write(jpeg, 0, 2);
    combined.write(new byte[] {(byte) 255, (byte) 225, 0, 34, 'E', 'x', 'i', 'f', 0, 0});
    combined.write(tiff.array());
    combined.write(jpeg, 2, jpeg.length - 2);
    var files = new ProductImageFiles(folder.toString());
    String id = UUID.randomUUID().toString();
    assertThat(files.store(id, combined.toByteArray())).containsExactly(10, 20);
    var bytes = files.read(id, 1600);
    assertThat(new String(bytes, java.nio.charset.StandardCharsets.ISO_8859_1))
        .doesNotContain("Exif");
    assertThat(ImageIO.read(new ByteArrayInputStream(bytes)).getWidth()).isEqualTo(10);
  }
}
