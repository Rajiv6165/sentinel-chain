import puppeteer from 'puppeteer-core';
import path from 'path';
import os from 'os';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\rajiv\\.gemini\\antigravity\\brain\\aedf15d9-fa50-4ff2-8caa-dcd27b258dcf';

async function captureInteractiveFeatures() {
  console.log('=== CAPTURING INTERACTIVE FEATURES (ITEMS 3 - 7) ===');

  const tempUserDir = path.join(os.tmpdir(), 'puppeteer_items3_7_' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: tempUserDir,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  // 1. Capture PR Comment in Engines Area
  console.log('Testing Engines PR Comment Preview tab...');
  await page.evaluate(() => {
    const el = document.getElementById('engines');
    if (el) el.scrollIntoView({ behavior: 'instant' });
    const btns = Array.from(document.querySelectorAll('#engines button'));
    const prTab = btns.find((b) => b.textContent.includes('See it in a pull request'));
    if (prTab) prTab.click();
  });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'item4-engines-pr-comment-1440.png'),
    clip: { x: 120, y: 0, width: 1200, height: 800 }
  });
  console.log('Captured item4-engines-pr-comment-1440.png');

  // 2. Capture Benchmark Explorer
  console.log('Testing Benchmark Explorer (#benchmarks)...');
  await page.evaluate(() => {
    const el = document.getElementById('benchmarks');
    if (el) el.scrollIntoView({ behavior: 'instant' });
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Toggle distance to 2
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#benchmarks button'));
    const dist2Btn = btns.find((b) => b.textContent.trim() === 'Distance ≤ 2');
    if (dist2Btn) dist2Btn.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  // Expand false positives
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#benchmarks button'));
    const fpBtn = btns.find((b) => b.textContent.includes('False Positives'));
    if (fpBtn) fpBtn.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'item3-benchmark-explorer-1440.png')
  });
  console.log('Captured item3-benchmark-explorer-1440.png');

  // 3. Capture Use In CI Section
  console.log('Testing Use In CI Section (#use-in-ci)...');
  await page.evaluate(() => {
    const el = document.getElementById('use-in-ci');
    if (el) el.scrollIntoView({ behavior: 'instant' });
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'item5-use-in-ci-1440.png')
  });
  console.log('Captured item5-use-in-ci-1440.png');

  // Switch to CLI Tab and copy
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#use-in-ci button'));
    const cliTab = btns.find((b) => b.textContent.includes('CLI Command'));
    if (cliTab) cliTab.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'item5-use-in-ci-cli-1440.png')
  });
  console.log('Captured item5-use-in-ci-cli-1440.png');

  // 4. Test Results Explorer in Unified Scan Results
  console.log('Testing Results Explorer in Unified Scan...');
  // Click Try sample
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 500));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const tryBtn = btns.find((b) => b.textContent.includes('Try sample'));
    if (tryBtn) tryBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Now switch to Unified Scan and trigger unified scan sample or view results
  // Let's upload test repo zip to see live Results Explorer
  const REPO_ZIP_PATH = path.resolve('test_fixtures/test_repo.zip');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#scanner button'));
    const unifiedTab = btns.find((b) => b.textContent.trim().toUpperCase() === 'UNIFIED SCAN');
    if (unifiedTab) unifiedTab.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  const fullFileInput = await page.$('#full-file-upload');
  if (fullFileInput) {
    await fullFileInput.uploadFile(REPO_ZIP_PATH);
    await new Promise((r) => setTimeout(r, 600));

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#scanner button'));
      const btn = btns.find((b) => b.textContent.includes('Start Unified Scan'));
      if (btn) btn.click();
    });

    console.log('Waiting for unified scan results to render...');
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#scanner');
        return el && (el.innerText.includes('Results Explorer') || el.innerText.includes('Full Scan Results'));
      },
      { timeout: 30000 }
    );
    await new Promise((r) => setTimeout(r, 1500));

    // Scroll to results
    await page.evaluate(() => {
      const el = document.querySelector('#scanner');
      if (el) el.scrollIntoView({ behavior: 'instant' });
    });
    await new Promise((r) => setTimeout(r, 800));

    // Capture standard Results Explorer view
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'item6-results-explorer-overview-1440.png')
    });
    console.log('Captured item6-results-explorer-overview-1440.png');

    // Test Severity filter: HIGH
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#scanner button'));
      const highBtn = btns.find((b) => b.textContent.trim() === 'High');
      if (highBtn) highBtn.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'item6-results-explorer-filtered-1440.png')
    });
    console.log('Captured item6-results-explorer-filtered-1440.png');

    // Test "See it in a pull request" tab in results view
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

  // 5. Test Mobile Viewport (375px) for WCAG / Responsiveness
  console.log('Testing Mobile Viewport (375px)...');
  await page.setViewport({ width: 375, height: 812 });
  await page.evaluate(() => {
    const el = document.getElementById('benchmarks');
    if (el) el.scrollIntoView({ behavior: 'instant' });
  });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'mobile-benchmark-explorer-375.png')
  });
  console.log('Captured mobile-benchmark-explorer-375.png');

  await browser.close();
  console.log('=== ALL SCREENSHOTS CAPTURED SUCCESSFULLY ===');
}

captureInteractiveFeatures().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
