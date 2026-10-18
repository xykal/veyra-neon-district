import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 90000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open:'never' }]],
  use: {
    baseURL:'http://127.0.0.1:3101',
    viewport:{width:1280,height:800},
    screenshot:'only-on-failure',
    trace:'retain-on-failure',
    launchOptions:{ args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] },
  },
  webServer:{ command:'node server/index.js',url:'http://127.0.0.1:3101/healthz',env:{PORT:'3101',DATA_DIR:'.test-data/browser'},reuseExistingServer:false,timeout:15000 },
});
