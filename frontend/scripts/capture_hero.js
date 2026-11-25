import puppeteer from 'puppeteer-core';
import path from 'path';
import os from 'os';
import fs from 'fs';

const ARTIFACT_DIR = 'C:\\Users\\rajiv\\.gemini\\antigravity\\brain\\aedf15d9-fa50-4ff2-8caa-dcd27b258dcf';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function capture() {
  const tempUserDir = path.join(os.tmpdir(), 'puppeteer_shot_' + Date.now());
  console.log(`Launching Chrome with userDataDir ${tempUserDir}...`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: tempUserDir,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const viewports = [
    { name: 'hero-1440x900.png', width: 1440, height: 900 },
    { name: 'hero-768x1024.png', width: 768, height: 1024 },
    { name: 'hero-390x844.png', width: 390, height: 844 }
  ];

  for (const vp of viewports) {
    console.log(`Setting viewport ${vp.width}x${vp.height}...`);
    const page = await browser.newPage();
    await page.setViewport({
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2
    });

    console.log(`Navigating to http://localhost:5173/ for ${vp.name}...`);
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });

    console.log('Waiting 3.8s for scan beam animation to complete...');
    await new Promise((r) => setTimeout(r, 3800));

    const outPath = path.join(ARTIFACT_DIR, vp.name);
    console.log(`Saving screenshot to ${outPath}...`);
    await page.screenshot({
      path: outPath,
      fullPage: false
    });
    console.log(`Saved ${vp.name}!`);
    await page.close();
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
