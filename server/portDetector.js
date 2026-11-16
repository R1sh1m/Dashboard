import { SerialPort } from 'serialport';
/**
 * Vendor IDs of common USB-to-serial bridges used by Espressif/ESP32 boards.
 */
const KNOWN_VENDOR_IDS = new Set([0x303a, 0x10c4, 0x1a86, 0x0403]);
/**
 * Preferred vendor-ID ordering used to rank candidate ports when multiple
 * compatible adapters are connected. Espressif native USB-CDC comes first.
 */
const VENDOR_PRIORITY = new Map([
    [0x303a, 0], // Espressif Systems (ESP32 native USB-CDC)
    [0x10c4, 1], // Silicon Labs CP210x
    [0x1a86, 2], // QinHeng CH340
    [0x0403, 3], // FTDI
]);
function portInfo(port) {
    return {
        path: port.path,
        vendorId: port.vendorId ? parseInt(port.vendorId, 16) : null,
        productId: port.productId ? parseInt(port.productId, 16) : null,
        manufacturer: port.manufacturer ?? null,
        serialNumber: port.serialNumber ?? null,
    };
}
function isKnownVendor(info) {
    return info.vendorId !== null && KNOWN_VENDOR_IDS.has(info.vendorId);
}
function rankVendor(info) {
    return info.vendorId !== null ? (VENDOR_PRIORITY.get(info.vendorId) ?? 99) : 99;
}
/**
 * Returns the best matching serial port path for the Artemis Ground ESP32,
 * or null if no compatible port is currently available.
 *
 * Ranking: preferred vendor first, then any known USB bridge vendor.
 */
export async function findEsp32Port() {
    const ports = await SerialPort.list();
    const candidates = ports.map(portInfo).filter(isKnownVendor);
    if (candidates.length === 0)
        return null;
    candidates.sort((a, b) => rankVendor(a) - rankVendor(b) || a.path.localeCompare(b.path));
    return candidates[0].path;
}
/**
 * Auto-reconnect helper. Polls the serial port list every `pollIntervalMs`
 * and invokes `onPortChanged(path)` whenever the best-match port appears,
 * disappears, or changes. Callers are responsible for opening/closing the
 * serial port in response to the callback.
 *
 * Returns an `abort` function that stops polling.
 */
export function watchEsp32Port(onPortChanged, options = {}) {
    const { pollIntervalMs = 2000 } = options;
    let lastPath = null;
    let timer = null;
    const tick = async () => {
        const path = await findEsp32Port();
        if (path !== lastPath) {
            lastPath = path;
            onPortChanged(path);
        }
        timer = setTimeout(tick, pollIntervalMs);
    };
    void tick();
    return () => {
        if (timer)
            clearTimeout(timer);
        timer = null;
    };
}
