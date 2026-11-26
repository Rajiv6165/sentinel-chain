import puppeteer from 'puppeteer-core';
import path from 'path';
import os from 'os';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\rajiv\\.gemini\\antigravity\\brain\\aedf15d9-fa50-4ff2-8caa-dcd27b258dcf';

async function capturePreciseResults() {
  const tempUserDir = path.join(os.tmpdir(), 'puppeteer_precise_' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: tempUserDir,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  // 1. Engines PR Comment Preview
  console.log('Capturing Engines PR comment preview...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#engines button'));
    const prTab = btns.find((b) => b.textContent.includes('See it in a pull request'));
    if (prTab) prTab.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  const enginesEl = await page.$('#engines');
  if (enginesEl) {
    await enginesEl.screenshot({
      path: path.join(ARTIFACTS_DIR, 'item4-engines-pr-comment-1440.png')
    });
    console.log('Captured item4-engines-pr-comment-1440.png (element screenshot)');
  }

  // 2. Load Sample Data or Unified Scan to view FullScanResults
  console.log('Uploading test_repo.zip for unified scan...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#scanner button'));
    const unifiedTab = btns.find((b) => b.textContent.trim().toUpperCase() === 'UNIFIED SCAN');
    if (unifiedTab) unifiedTab.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  const REPO_ZIP_PATH = path.resolve('test_fixtures/test_repo.zip');
  const fullFileInput = await page.$('#full-file-upload');
  if (fullFileInput) {
    await fullFileInput.uploadFile(REPO_ZIP_PATH);
    await new Promise((r) => setTimeout(r, 600));

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#scanner button'));
      const btn = btns.find((b) => b.textContent.includes('Start Unified Scan'));
      if (btn) btn.click();
    });

    console.log('Waiting for scan results...');
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#scanner');
        return el && el.innerText.includes('Results Explorer');
      },
      { timeout: 30000 }
    );
    await new Promise((r) => setTimeout(r, 1500));

    // Scroll directly to FullScanResults
    await page.evaluate(() => {
      const fullScanResults = document.querySelector('#scanner .mt-8');
      if (fullScanResults) {
        fullScanResults.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    });
    await new Promise((r) => setTimeout(r, 800));

    // Capture Results Explorer Overview
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'item6-results-explorer-overview-1440.png')
    });
    console.log('Captured item6-results-explorer-overview-1440.png');

    // Filter by Severity: High or Engine: Typosquat
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#scanner button'));
      const typoChip = btns.find((b) => b.textContent.trim() === 'Typosquat');
      if (typoChip) typoChip.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'item6-results-explorer-filtered-1440.png')
    });
    console.log('Captured item6-results-explorer-filtered-1440.png');

    // Reset filters and click "See it in a pull request" tab in results view
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#scanner button'));
      const prTab = btns.find((b) => b.textContent.includes('See it in a pull request'));
      if (prTab) prTab.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'item4-results-pr-comment-1440.png')
    });
    console.log('Captured item4-results-pr-comment-1440.png');
  }

  await browser.close();
  console.log('Done!');
}

capturePreciseResults().catch((err) => {
  console.error(err);
  process.exit(1);
});
