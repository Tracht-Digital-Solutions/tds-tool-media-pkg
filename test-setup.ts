/**
 * jsdom (25) ships `Blob`/`File` without `arrayBuffer()`. Both islands read the
 * user's file with it, so without this shim every test fails with
 * "f.arrayBuffer is not a function" — a limitation of the test DOM, not of the
 * tool: every browser that can run these tools has had `Blob.arrayBuffer` for
 * years.
 *
 * Implemented over `FileReader`, which jsdom does provide.
 */
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
