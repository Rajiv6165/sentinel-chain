import puppeteer from 'puppeteer-core';
import path from 'path';
import os from 'os';
import fs from 'fs';

const ARTIFACT_DIR = 'C:\\Users\\rajiv\\.gemini\\antigravity\\brain\\aedf15d9-fa50-4ff2-8caa-dcd27b258dcf';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function captureExpanded() {
  const tempUserDir = path.join(os.tmpdir(), 'puppeteer_shot_exp_' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: tempUserDir,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1500));

  // Click Try sample
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((el) => el.textContent.includes('Try sample'));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Click on the jsonwebtoken row to expand it
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const jwtRow = rows.find((r) => r.textContent.includes('jsonwebtoken'));
    if (jwtRow) jwtRow.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  const scannerEl = await page.$('#scanner');
  if (scannerEl) {
    await scannerEl.screenshot({
      path: path.join(ARTIFACT_DIR, 'sample-results-expanded-1440.png')
    });
    console.log('Saved sample-results-expanded-1440.png!');
  }

  await browser.close();
  try {
    fs.rmSync(tempUserDir, { recursive: true, force: true });
  } catch (_) {}
}

captureExpanded().catch(console.error);
