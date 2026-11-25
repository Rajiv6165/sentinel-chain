import puppeteer from 'puppeteer-core';
import path from 'path';
import os from 'os';
import fs from 'fs';

const ARTIFACT_DIR = 'C:\\Users\\rajiv\\.gemini\\antigravity\\brain\\aedf15d9-fa50-4ff2-8caa-dcd27b258dcf';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function capture() {
  const tempUserDir = path.join(os.tmpdir(), 'puppeteer_shot_full_' + Date.now());
  console.log(`Launching Chrome with userDataDir ${tempUserDir}...`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: tempUserDir,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('PAGE CONSOLE ERR:', msg.text());
  });

  await page.setViewport({
    width: 1440,
    height: 1000,
    deviceScaleFactor: 2
  });

  console.log('Navigating to http://localhost:5173/...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  // 1. Capture Engines Section (element screenshot)
  console.log('Capturing engines section...');
  const enginesEl = await page.$('#engines');
  if (enginesEl) {
    await enginesEl.screenshot({
      path: path.join(ARTIFACT_DIR, 'engines-grid-1440.png')
    });
    console.log('Saved engines-grid-1440.png');
  }

  // 2. Click "Try sample" button in Console Card
  console.log('Clicking "Try sample" button...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((el) => el.textContent.includes('Try sample'));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Capture Scanner section with sample results rendered
  const sampleScannerEl = await page.$('#scanner');
  if (sampleScannerEl) {
    console.log('Capturing sample scan results element...');
    await sampleScannerEl.screenshot({
      path: path.join(ARTIFACT_DIR, 'sample-results-1440.png')
    });
    console.log('Saved sample-results-1440.png');
  }

  // 3. Switch to "Unified Scan" tab
  console.log('Switching to Unified Scan tab...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const tab = btns.find((el) => el.textContent.trim().toUpperCase() === 'UNIFIED SCAN');
    if (tab) tab.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  const unifiedScannerEl = await page.$('#scanner');
  if (unifiedScannerEl) {
    console.log('Capturing unified scan element...');
    await unifiedScannerEl.screenshot({
      path: path.join(ARTIFACT_DIR, 'unified-scan-1440.png')
    });
    console.log('Saved unified-scan-1440.png');
  }

  // 4. Switch to "Trend Dashboard" tab
  console.log('Switching to Trend Dashboard tab...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const tab = btns.find((el) => el.textContent.trim().toUpperCase() === 'TREND DASHBOARD');
    if (tab) tab.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  const trendScannerEl = await page.$('#scanner');
  if (trendScannerEl) {
    console.log('Capturing trend dashboard element...');
    await trendScannerEl.screenshot({
      path: path.join(ARTIFACT_DIR, 'trend-dashboard-1440.png')
    });
    console.log('Saved trend-dashboard-1440.png');
  }

  await browser.close();
  try {
    fs.rmSync(tempUserDir, { recursive: true, force: true });
  } catch (_) {}
  console.log('All screenshots captured successfully!');
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
