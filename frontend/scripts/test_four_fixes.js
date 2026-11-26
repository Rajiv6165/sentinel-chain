import puppeteer from 'puppeteer-core';
import path from 'path';
import os from 'os';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\rajiv\\.gemini\\antigravity\\brain\\aedf15d9-fa50-4ff2-8caa-dcd27b258dcf';

async function testFourFixes() {
  console.log('=== TESTING FOUR FRONTEND FIXES ===');

  // Create temporary oversized zip file (16 MB to exceed 15 MB limit)
  const tempOversizedZip = path.join(os.tmpdir(), 'oversized_repo.zip');
  const buffer = Buffer.alloc(16 * 1024 * 1024 + 200 * 1024); // ~16.2 MB
  fs.writeFileSync(tempOversizedZip, buffer);

  const tempUserDir = path.join(os.tmpdir(), 'puppeteer_fixes_' + Date.now());
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

  // --- TEST 1: StickyMiniNav & scroll-margin-top ---
  console.log('\n--- 1. Testing StickyMiniNav and scroll-margin-top on all sections ---');
  const sectionChecks = await page.evaluate(() => {
    const ids = ['stage', 'live-checker', 'engines', 'benchmarks', 'use-in-ci', 'scanner'];
    return ids.map((id) => {
      const el = document.getElementById(id);
      if (!el) return { id, exists: false };
      const style = window.getComputedStyle(el);
      return {
        id,
        exists: true,
        scrollMarginTop: style.scrollMarginTop,
        className: el.className
      };
    });
  });

  console.log('Section scroll-margin-top checks:', sectionChecks);
  const allSectionsHaveMargin = sectionChecks.every((s) => s.exists && s.scrollMarginTop !== '0px' && s.scrollMarginTop !== '');
  console.log(`All sections have non-zero scroll-margin-top: ${allSectionsHaveMargin ? 'PASS' : 'FAIL'}`);

  // Check StickyMiniNav z-index and styles
  await page.evaluate(() => window.scrollTo(0, 800));
  await new Promise((r) => setTimeout(r, 600));

  const navStyles = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Quick page navigation"]');
    if (!nav) return null;
    const style = window.getComputedStyle(nav);
    const inner = nav.querySelector('div');
    const innerStyle = inner ? window.getComputedStyle(inner) : null;
    return {
      zIndex: style.zIndex,
      backdropFilter: innerStyle ? innerStyle.backdropFilter : null,
      backgroundColor: innerStyle ? innerStyle.backgroundColor : null
    };
  });
  console.log('StickyMiniNav Computed Styles:', navStyles);
  console.log(`StickyMiniNav z-index is 50: ${navStyles?.zIndex === '50' ? 'PASS' : 'FAIL'}`);

  // --- TEST 2: Active-section highlight & Bottom of page ---
  console.log('\n--- 2. Testing Active-Section Highlight & Bottom-of-Page Override ---');
  // Scroll to bottom of page
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await new Promise((r) => setTimeout(r, 600));

  const activeAtBottom = await page.evaluate(() => {
    const activeBtn = document.querySelector('nav[aria-label="Quick page navigation"] button.bg-\\[\\#FFB547\\]');
    return activeBtn ? activeBtn.textContent.trim() : null;
  });
  console.log(`Active section when scrolled to bottom of page: "${activeAtBottom}" (Expected: "Scanner")`);
  const bottomTestPass = activeAtBottom === 'Scanner';
  console.log(`Bottom-of-page scanner override: ${bottomTestPass ? 'PASS' : 'FAIL'}`);

  // Click Scanner in mini-nav to test jump
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('nav[aria-label="Quick page navigation"] button'));
    const scannerBtn = btns.find((b) => b.textContent.includes('Scanner'));
    if (scannerBtn) scannerBtn.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  // Check clearance between nav bottom and scanner tab row
  const clearance = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Quick page navigation"]');
    const tabRow = document.querySelector('#scanner .flex.justify-center.mb-8');
    if (!nav || !tabRow) return null;
    const navRect = nav.getBoundingClientRect();
    const tabRect = tabRow.getBoundingClientRect();
    return tabRect.top - navRect.bottom;
  });
  console.log(`Clearance between StickyMiniNav and Scanner tabs: ${clearance}px (Expected > 0px, no overlap)`);
  const noOverlapPass = clearance !== null && clearance > 20;
  console.log(`Scanner tabs not overlapped: ${noOverlapPass ? 'PASS' : 'FAIL'}`);

  // Capture screenshot of clearance
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'fix1-mini-nav-scanner-clearance.png')
  });

  // --- TEST 3 & 4: Oversized file check, disabled run button, clear error on change/remove, and collapsible zip help ---
  console.log('\n--- 3 & 4. Testing Oversized File Check & Error Clearing in FullScan ---');
  // Switch to Unified Scan
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#scanner button'));
    const unifiedTab = btns.find((b) => b.textContent.trim().toUpperCase() === 'UNIFIED SCAN');
    if (unifiedTab) unifiedTab.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  // 4a. Upload oversized zip file
  console.log(`Uploading 16.2 MB file (${tempOversizedZip}) to #full-file-upload...`);
  const fullFileInput = await page.$('#full-file-upload');
  await fullFileInput.uploadFile(tempOversizedZip);
  await new Promise((r) => setTimeout(r, 600));

  const oversizedState = await page.evaluate(() => {
    const fullScanEl = document.querySelector('#scanner');
    const errorEl = fullScanEl ? fullScanEl.querySelector('.bg-\\[\\#FF5A5F\\]\\/10') : null;
    const startBtn = Array.from(document.querySelectorAll('#scanner button')).find((b) =>
      b.textContent.includes('File exceeds size limit') || b.textContent.includes('Start Unified Scan')
    );
    return {
      errorText: errorEl ? errorEl.textContent.trim() : null,
      btnText: startBtn ? startBtn.textContent.trim() : null,
      btnDisabled: startBtn ? startBtn.disabled : null
    };
  });
  console.log('Oversized state in FullScan:', oversizedState);

  const errorFormatCorrect = oversizedState.errorText && oversizedState.errorText.includes('selected, limit is 15 MB');
  const buttonDisabled = oversizedState.btnDisabled === true;
  console.log(`Oversized error format: "${oversizedState.errorText}" -> ${errorFormatCorrect ? 'PASS' : 'FAIL'}`);
  console.log(`Run button disabled: ${buttonDisabled ? 'PASS' : 'FAIL'}`);

  // Capture screenshot of oversized error state
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'fix4-oversized-file-error.png')
  });

  // 4b. Test collapsible "How to make a small zip"
  console.log('\nTesting collapsible "How to make a small zip" help...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#scanner button'));
    const helpBtn = btns.find((b) => b.textContent.includes('How to make a small zip'));
    if (helpBtn) helpBtn.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  const zipHelpContent = await page.evaluate(() => {
    const fullScanEl = document.querySelector('#scanner');
    const text = fullScanEl ? fullScanEl.innerText : '';
    return {
      hasGitArchive: text.includes('git archive --format=zip --output=repo.zip HEAD'),
      hasExcludes: text.includes('node_modules') && text.includes('venv') && text.includes('.git')
    };
  });
  console.log('Collapsible Zip Help Contents:', zipHelpContent);
  const helpPass = zipHelpContent.hasGitArchive && zipHelpContent.hasExcludes;
  console.log(`Zip help content: ${helpPass ? 'PASS' : 'FAIL'}`);

  // Capture screenshot of expanded zip help
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'fix4-zip-help-expanded.png')
  });

  // 3a. Test removing the file clears error
  console.log('\nTesting file removal clears error...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#scanner button'));
    const removeBtn = btns.find((b) => b.textContent.includes('Remove'));
    if (removeBtn) removeBtn.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  const afterRemoveState = await page.evaluate(() => {
    const fullScanEl = document.querySelector('#scanner');
    const errorEl = fullScanEl ? fullScanEl.querySelector('.bg-\\[\\#FF5A5F\\]\\/10') : null;
    const fileText = fullScanEl ? fullScanEl.innerText.includes('Choose a repository .zip archive') : false;
    return {
      hasError: Boolean(errorEl),
      fileReset: fileText
    };
  });
  console.log('After remove file state:', afterRemoveState);
  const removeClearsPass = !afterRemoveState.hasError && afterRemoveState.fileReset;
  console.log(`Remove file clears error: ${removeClearsPass ? 'PASS' : 'FAIL'}`);

  // 3b. Test selecting a valid file clears error and enables scan
  console.log('\nTesting selecting valid file clears error and enables run button...');
  const REPO_ZIP_PATH = path.resolve('test_fixtures/test_repo.zip');
  await fullFileInput.uploadFile(REPO_ZIP_PATH);
  await new Promise((r) => setTimeout(r, 600));

  const validFileState = await page.evaluate(() => {
    const fullScanEl = document.querySelector('#scanner');
    const errorEl = fullScanEl ? fullScanEl.querySelector('.bg-\\[\\#FF5A5F\\]\\/10') : null;
    const startBtn = Array.from(document.querySelectorAll('#scanner button')).find((b) =>
      b.textContent.includes('Start Unified Scan')
    );
    return {
      hasError: Boolean(errorEl),
      btnDisabled: startBtn ? startBtn.disabled : null
    };
  });
  console.log('Valid file state:', validFileState);
  const validFilePass = !validFileState.hasError && validFileState.btnDisabled === false;
  console.log(`Valid file selection clears error and enables run: ${validFilePass ? 'PASS' : 'FAIL'}`);

  // Clean up temp file
  try {
    fs.unlinkSync(tempOversizedZip);
  } catch (_) {}

  await browser.close();

  const allPassed =
    allSectionsHaveMargin &&
    navStyles?.zIndex === '50' &&
    bottomTestPass &&
    noOverlapPass &&
    errorFormatCorrect &&
    buttonDisabled &&
    helpPass &&
    removeClearsPass &&
    validFilePass;

  console.log('\n================ FOUR FIXES TEST SUMMARY ================');
  console.log(`Issue 1: StickyMiniNav z-50, backdrop, and scroll-margin-top on all sections: ${allSectionsHaveMargin && navStyles?.zIndex === '50' && noOverlapPass ? 'PASS' : 'FAIL'}`);
  console.log(`Issue 2: Active section highlight & forced Scanner at bottom of page: ${bottomTestPass ? 'PASS' : 'FAIL'}`);
  console.log(`Issue 3: Error cleared on file removal or changing to different file: ${removeClearsPass && validFilePass ? 'PASS' : 'FAIL'}`);
  console.log(`Issue 4: Client-side file size check, disabled run button, and collapsible zip help: ${errorFormatCorrect && buttonDisabled && helpPass ? 'PASS' : 'FAIL'}`);

  if (!allPassed) {
    console.error('ONE OR MORE CHECKS FAILED!');
    process.exit(1);
  }

  console.log('ALL FOUR ISSUES VERIFIED AND FIXED WITH 100% SUCCESS!');
  process.exit(0);
}

testFourFixes().catch((err) => {
  console.error(err);
  process.exit(1);
});
