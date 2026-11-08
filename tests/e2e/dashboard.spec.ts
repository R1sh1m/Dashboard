import { test, expect } from '@playwright/test';

const TELEMETRY_PACKET = JSON.stringify({
  seq: 42,
  timestamp: Date.now(),
  bot_status: { state: 'WALKING', uptime_sec: 3661, mode: 'AUTONOMOUS', loop_hz: 10.0 },
  gps: {
    lat: 12.9748,
    lng: 79.1655,
    alt_m: 92.5,
    fix: 3,
    sats: 7,
    speed_mps: 1.5,
    heading_deg: 45.0,
    hdop: 1.2,
    valid: true,
  },
  env: {
    temp_c: 24.5,
    humidity_pct: 55.0,
    pressure_hpa: 1013.2,
    gas_resistance_kohm: 45.0,
    iaq: 45,
    anomaly_flag: false,
  },
  radar: { human_detected: true, target_state: 'MOVING', distance_cm: 150, energy: 75 },
  power: { voltage_v: 11.85, current_a: 2.3, percent: 78, cell_voltages: [3.95, 3.95, 3.95] },
  motors: { active_count: 6, avg_temp_c: 45.0, max_temp_c: 52.0, fault_mask: 0, servos: [] },
  link: { rssi_dbm: -45, snr_db: 8.5, packet_loss_pct: 0.0, latency_ms: 12 },
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((packet) => {
    const fakeReader = {
      read: () =>
        Promise.resolve({
          value: new TextEncoder().encode(packet + '\n'),
          done: false,
        }),
      releaseLock: () => {},
      cancel: () => Promise.resolve(),
    };
    const fakePort = {
      readable: { getReader: () => fakeReader },
      writable: { getWriter: () => ({ write: () => Promise.resolve(), releaseLock: () => {} }) },
      open: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };
    (navigator as any).serial = {
      requestPort: () => Promise.resolve(fakePort),
      getPorts: () => Promise.resolve([fakePort]),
    };
  }, TELEMETRY_PACKET);

  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  (page as any)._collectedErrors = errors;

  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

async function openSheetAndConnect(page: any) {
  await page.getByRole('button', { name: /telemetry/i }).click();
  await page.waitForTimeout(1000);
  await expect(page.locator('.sheet.is-open')).toBeVisible();
  await page.locator('.sheet .serial-indicator').click();
  await page.waitForTimeout(1500);
  // Inject telemetry directly into app state (bypasses serial readLoop)
  await page.evaluate((packet) => {
    (window as any).__serialService.testInject(JSON.parse(packet));
  }, TELEMETRY_PACKET);
  await page.waitForTimeout(500);
}

test('dashboard loads with zero console errors and no broken assets', async ({ page }) => {
  await expect(page.locator('.leaflet-container')).toBeVisible();

  const failedRequests: string[] = [];
  page.on('requestfailed', (req) => {
    if (!req.url().includes('favicon')) failedRequests.push(req.url());
  });

  await page.waitForTimeout(2000);

  const errors = (page as any)._collectedErrors;
  expect(errors).toHaveLength(0);
  expect(failedRequests).toHaveLength(0);
});

test('GPS card renders coordinates, fix, sats, altitude, HDOP', async ({ page }) => {
  await openSheetAndConnect(page);
  // Click "GPS" in LeftSidebar -> opens sensor-pair with GPS + Environmental + WirelessLink cards
  await page.getByRole('button', { name: /^GPS$/ }).click();
  await page.waitForTimeout(500);

  await expect(page.getByText(/12\.974800/)).toBeVisible();
  await expect(page.getByText(/79\.165500/)).toBeVisible();
  await expect(page.getByText(/3D FIX/)).toBeVisible();
  await expect(page.getByText(/SATS 7/)).toBeVisible();
  await expect(page.getByText(/92\.5 m/)).toBeVisible();
  await expect(page.getByText(/HDOP 1\.2/)).toBeVisible();
});

test('Environmental card renders temp, humidity, pressure, gas, IAQ', async ({ page }) => {
  await openSheetAndConnect(page);
  await page.getByRole('button', { name: /^GPS$/ }).click();
  await page.waitForTimeout(500);

  await expect(page.getByText(/24\.5/)).toBeVisible();
  await expect(page.getByText(/°C/)).toBeVisible();
  await expect(page.getByText(/55\.0/)).toBeVisible();
  await expect(page.getByText(/1013\.2/)).toBeVisible();
  await expect(page.getByText(/hPa/)).toBeVisible();
  await expect(page.getByText(/45\.0/)).toBeVisible();
  await expect(page.getByText(/kΩ/)).toBeVisible();
  await expect(page.getByText(/IAQ 45/)).toBeVisible();
  await expect(page.getByText(/NOMINAL/)).toBeVisible();
});

test('Radar card renders target state, distance, human detection', async ({ page }) => {
  await openSheetAndConnect(page);
  await page.getByRole('button', { name: /^Radar$/ }).click();
  await page.waitForTimeout(500);

  const radarCard = page.locator('div:has-text("LD2410B MMWAVE RADAR")');
  await expect(radarCard.locator('div:has-text("TARGET STATE")').last().getByText(/MOVING/)).toBeVisible();
  await expect(radarCard.getByText(/HUMAN PRESENT/)).toBeVisible();
  await expect(radarCard.locator('div:has-text("DISTANCE")').last().getByText(/150/)).toBeVisible();
  await expect(radarCard.locator('div:has-text("DISTANCE")').last().getByText(/cm/)).toBeVisible();
  await expect(radarCard.locator('div:has-text("SIGNAL ENERGY")').last().getByText(/75/)).toBeVisible();
  await expect(radarCard.locator('div:has-text("SIGNAL ENERGY")').last().getByText(/%/)).toBeVisible();
});

test('Power card renders voltage, current, SoC, cell voltages', async ({ page }) => {
  await openSheetAndConnect(page);
  await page.getByRole('tab', { name: /battery & power/i }).click();
  await page.waitForTimeout(500);

  const powerCard = page.locator('div:has-text("ESTIMATED SERVO POWER")');
  await expect(powerCard.getByText(/11\.85/)).toBeVisible();
  await expect(powerCard.getByText(/\(2\.30 A\)/)).toBeVisible();
  await expect(powerCard.getByText(/78%/)).toBeVisible();
  await expect(powerCard.getByText(/CELL 1/)).toBeVisible();
  await expect(powerCard.getByText(/CELL 2/)).toBeVisible();
  await expect(powerCard.getByText(/CELL 3/)).toBeVisible();
  await expect(powerCard.getByText(/3\.95V/).first()).toBeVisible();
});

test('Bot status card renders state, mode, loop Hz, uptime', async ({ page }) => {
  await openSheetAndConnect(page);
  await page.getByRole('tab', { name: /bot status/i }).click();
  await page.waitForTimeout(500);

  const botCard = page.locator('div:has-text("BOT CONTROLLER")');
  await expect(botCard.locator('div:has-text("STATE")').last().getByText(/WALKING/)).toBeVisible();
  await expect(botCard.getByText(/AUTONOMOUS/)).toBeVisible();
  await expect(botCard.getByText(/10\.0/)).toBeVisible();
  await expect(botCard.getByText(/Hz/)).toBeVisible();
  await expect(botCard.getByText(/01:01:01/)).toBeVisible();
});

test('Leaflet map renders container, rover marker, home marker', async ({ page }) => {
  await openSheetAndConnect(page);

  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.custom-robot-pin')).toBeVisible();
  await expect(page.locator('.custom-home-pin')).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.locator('.leaflet-container')).toBeVisible();
});

test('Sensor sheet opens and closes', async ({ page }) => {
  await page.getByRole('button', { name: /telemetry/i }).click();
  await page.waitForTimeout(500);

  const sheet = page.locator('.sheet.is-open');
  await expect(sheet).toBeVisible();

  await page.getByRole('button', { name: /home/i }).first().click();
  await page.waitForTimeout(500);

  await expect(sheet).not.toBeVisible();
});

test('Responsive: desktop viewport 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1000);
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.maps-shell')).toBeVisible();
});

test('Responsive: mobile viewport 390x844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.maps-shell')).toBeVisible();
});

test('Capture full-page screenshot', async ({ page }) => {
  await openSheetAndConnect(page);
  await page.screenshot({
    path: 'Docs/TestResults/dashboard_e2e_playwright.png',
    fullPage: true,
  });
});
