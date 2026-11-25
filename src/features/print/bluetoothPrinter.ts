/**
 * Port dari Haoshii. Bluetooth transport for the thermal printer — pairing, reconnect, and
 * chunked ESC/POS writes. What gets printed is built in receipt.ts; this file
 * only moves bytes.
 *
 * Uses Web Bluetooth, which exists in Chrome/Edge on Android and desktop but
 * NOT in iOS Safari — callers must check isBluetoothPrintSupported() and fall
 * back to window.print(). Requires HTTPS (or localhost) and a user gesture for
 * the first pairing.
 */

/**
 * GATT services the common cheap ESC/POS printers expose, in the order tried.
 * Covers the usual Indonesian-market 58mm models (Xprinter, GOOJPRT, EPPOS,
 * generic "BlueTooth Printer"): 18f0 and ffe0/ff00 style serial services plus
 * the ISSC transparent-UART UUID some clones use.
 */
const PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

/**
 * BLE writes are MTU-bound. 100 bytes with a short pause lands under every
 * MTU seen on these printers; bigger chunks make some models silently drop
 * the tail of the receipt.
 */
const CHUNK_SIZE = 100;
const CHUNK_DELAY_MS = 20;

// Re-pairing needs the browser chooser (a user gesture), so the paired device
// is held for the session. Web Bluetooth cannot silently re-acquire a device
// after a page reload — the chooser will simply appear again on first print.
let cachedDevice: BluetoothDevice | null = null;
let cachedCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

export const isBluetoothPrintSupported = (): boolean =>
  typeof navigator !== "undefined" && navigator.bluetooth !== undefined;

const findWritableCharacteristic = async (
  server: BluetoothRemoteGATTServer,
): Promise<BluetoothRemoteGATTCharacteristic> => {
  const services = await server.getPrimaryServices();
  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    const writable = characteristics.find(
      (c) => c.properties.write || c.properties.writeWithoutResponse,
    );
    if (writable) {
      if (import.meta.env.DEV) console.info(`Thermal printer: using ${service.uuid} / ${writable.uuid}`);
      return writable;
    }
  }
  throw new Error("Printer ini belum didukung. Coba cetak lewat browser.");
};

const connect = async (): Promise<BluetoothRemoteGATTCharacteristic> => {
  const bluetooth = navigator.bluetooth;
  if (!bluetooth) {
    throw new Error("Browser ini tidak mendukung Bluetooth (pakai Chrome di Android)");
  }

  // Reuse the session's device when its connection still stands or can be
  // re-established without the chooser.
  if (cachedDevice?.gatt) {
    try {
      if (!cachedDevice.gatt.connected) {
        await cachedDevice.gatt.connect();
        cachedCharacteristic = await findWritableCharacteristic(cachedDevice.gatt);
      }
      if (cachedCharacteristic) return cachedCharacteristic;
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Thermal printer: reconnect failed, re-pairing", error);
      cachedDevice = null;
      cachedCharacteristic = null;
    }
  }

  const device = await bluetooth.requestDevice({
    // Printers advertise wildly inconsistent services, so the chooser shows
    // everything and the service list only unlocks GATT access post-pairing.
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });
  if (!device.gatt) throw new Error("Printer ini tidak bisa dihubungkan lewat Bluetooth.");

  const server = await device.gatt.connect();
  const characteristic = await findWritableCharacteristic(server);

  cachedDevice = device;
  cachedCharacteristic = characteristic;
  return characteristic;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send one ESC/POS job to the paired printer, pairing first if needed.
 * Throws with an Indonesian message for the caller to toast.
 */
export const printViaBluetooth = async (bytes: Uint8Array): Promise<void> => {
  let characteristic: BluetoothRemoteGATTCharacteristic;
  try {
    characteristic = await connect();
  } catch (error) {
    // The user closing the chooser is a cancel, not a failure worth a red toast.
    if ((error as { name?: string }).name === "NotFoundError") {
      throw new PrintCancelled();
    }
    throw error;
  }

  try {
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, i + CHUNK_SIZE);
      if (characteristic.properties.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(chunk);
      } else {
        await characteristic.writeValue(chunk);
      }
      await delay(CHUNK_DELAY_MS);
    }
  } catch (error) {
    // A mid-job drop leaves the cache pointing at a dead connection.
    cachedCharacteristic = null;
    if (import.meta.env.DEV) console.error("Thermal printer: write failed", error);
    throw new Error("Koneksi printer terputus. Coba cetak lagi.");
  }
};

/** Thrown when the user dismisses the device chooser — callers should ignore it. */
export class PrintCancelled extends Error {
  constructor() {
    super("Print cancelled");
    this.name = "PrintCancelled";
  }
}
