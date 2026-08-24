/**
 * Test environment setup.
 *
 * This file used to shim `Blob.prototype.arrayBuffer`, which jsdom 25 did not
 * implement — both file-reading islands call it, so without the shim every test
 * failed with "f.arrayBuffer is not a function". jsdom 30 provides it (and
 * `Blob.prototype.text`) natively, so the shim is gone.
 *
 * Kept as a file rather than dropped from `vitest.config.ts`: the three packs
 * that read user files all point `setupFiles` here, and the next environment
 * gap belongs in one place. Adding an unconditional polyfill here would now
 * OVERWRITE a real implementation, so guard anything added.
 */
export {};
