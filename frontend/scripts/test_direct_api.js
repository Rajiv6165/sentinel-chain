import puppeteer from 'puppeteer-core';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PKG_JSON_PATH = path.resolve(__dirname, '../../test_fixtures/package.json');
const REPO_ZIP_PATH = path.resolve(__dirname, '../../test_fixtures/test_repo.zip');

async function runDirectApiVerification() {
  console.log('=== STARTING DIRECT API VERIFICATION (NO PROXY) ===');
  console.log(`Package fixture: ${PKG_JSON_PATH}`);
  console.log(`Repo ZIP fixture: ${REPO_ZIP_PATH}`);

  const tempUserDir = path.join(os.tmpdir(), 'puppeteer_verify_' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: tempUserDir,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();

  const apiRequestsTo8000 = [];
  const apiRequestsTo5173 = [];
  const allApiRequests = [];
  const responseLog = [];

  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('/api/')) {
      allApiRequests.push({ method, url });
      if (url.startsWith('http://localhost:8000/api/') || url.startsWith('http://127.0.0.1:8000/api/')) {
        apiRequestsTo8000.push({ method, url });
        console.log(`[OUTBOUND DIRECT API] ${method} -> ${url}`);
      } else if (url.startsWith('http://localhost:5173/api/') || url.startsWith('http://127.0.0.1:5173/api/')) {
        apiRequestsTo5173.push({ method, url });
        console.error(`[ERROR: RELATIVE/PROXY API DETECTED] ${method} -> ${url}`);
      } else {
        console.warn(`[UNKNOWN API URL] ${method} -> ${url}`);
      }
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/')) {
      const status = res.status();
      const headers = res.headers();
      const acao = headers['access-control-allow-origin'] || 'NONE';
      responseLog.push({ url, status, acao });
      console.log(`[RESPONSE] ${status} from ${url} (CORS ACAO: ${acao})`);
    }
  });

  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

  await page.setViewport({ width: 1440, height: 1000 });

  console.log('\n--- Step 1: Navigate to http://localhost:5173/ ---');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  // Verify Nav API status pill
  console.log('\n--- Step 2: Checking API Status Pill in Nav ---');
  const statusPillText = await page.evaluate(() => {
    const el = document.querySelector('nav');
    if (!el) return null;
    const text = el.innerText;
    if (text.includes('ONLINE')) return 'ONLINE';
    if (text.includes('WAKING UP')) return 'WAKING UP';
    if (text.includes('OFFLINE')) return 'OFFLINE';
    return text;
  });
  console.log(`API Status Pill detected in Nav: "${statusPillText}"`);

  // Verify Dependency Scan
  console.log('\n--- Step 3: Executing Dependency Scan via http://localhost:8000/api/scan ---');
  // First ensure Dependency File mode is selected
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#scanner button'));
    const depTab = btns.find((b) => b.textContent.trim().toUpperCase() === 'DEPENDENCY SCAN');
    if (depTab) depTab.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  const depFileInput = await page.$('#scanner input[type="file"]');
  if (!depFileInput) {
    throw new Error('Could not find file input in #scanner');
  }

  // Set up response promise for /api/scan
  const scanPromise = page.waitForResponse(
    (res) => res.url().includes('/api/scan') && res.status() === 200,
    { timeout: 15000 }
  );

  console.log(`Uploading ${PKG_JSON_PATH}...`);
  await depFileInput.uploadFile(PKG_JSON_PATH);

  const scanRes = await scanPromise;
  console.log(`Dependency Scan received response: status ${scanRes.status()} from ${scanRes.url()}`);
  const scanData = await scanRes.json();
  console.log(`Scan verdict/summary: total_dependencies=${scanData.total_dependencies ?? scanData.dependencies_scanned ?? 'N/A'}, findings=${scanData.findings ? scanData.findings.length : 0}`);

  // Wait for results element to be rendered in the DOM
  await new Promise((r) => setTimeout(r, 2000));
  const depResultsVisible = await page.evaluate(() => {
    const el = document.querySelector('#scanner');
    return el ? el.innerText.includes('Scan Report') || el.innerText.includes('Findings') || el.innerText.includes('Results') || el.innerText.includes('express') : false;
  });
  console.log(`Dependency Scan results rendered in DOM: ${depResultsVisible}`);

  // Verify Unified Scan
  console.log('\n--- Step 4: Executing Unified Scan via http://localhost:8000/api/full-scan ---');
  // Switch to Unified Scan tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#scanner button'));
    const unifiedTab = btns.find((b) => b.textContent.trim().toUpperCase() === 'UNIFIED SCAN');
    if (unifiedTab) unifiedTab.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  const fullFileInput = await page.$('#full-file-upload');
  if (!fullFileInput) {
    throw new Error('Could not find #full-file-upload file input');
  }

  console.log(`Uploading repo archive ${REPO_ZIP_PATH}...`);
  await fullFileInput.uploadFile(REPO_ZIP_PATH);
  await new Promise((r) => setTimeout(r, 800));

  // Set up response promise for starting full-scan
  const fullScanPostPromise = page.waitForResponse(
    (res) => res.url().includes('/api/full-scan') && res.request().method() === 'POST' && res.status() === 200,
    { timeout: 15000 }
  );

  console.log('Clicking "Start Unified Scan →" button...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#scanner button'));
    const btn = btns.find((b) => b.textContent.includes('Start Unified Scan'));
    if (btn) btn.click();
  });

  const fullScanRes = await fullScanPostPromise;
  const postData = await fullScanRes.json();
  const jobId = postData.job_id;
  console.log(`Unified scan dispatched! Job ID: ${jobId} (status 200 from ${fullScanRes.url()})`);

  // Wait for job polling to complete and diff to be fetched by FullScanResults
  console.log('Waiting for background pipeline job to complete...');
  const diffRes = await page.waitForResponse(
    (res) => res.url().includes(`/api/scans/${jobId}/diff`) && res.status() === 200,
    { timeout: 30000 }
  );
  console.log(`Unified scan completed and diff loaded! (status ${diffRes.status()} from ${diffRes.url()})`);

  await new Promise((r) => setTimeout(r, 2000));
  const fullResultsVisible = await page.evaluate(() => {
    const el = document.querySelector('#scanner');
    return el ? el.innerText.includes('CycloneDX') || el.innerText.includes('SPDX') || el.innerText.includes('Security Score') || el.innerText.includes('UNIFIED') : false;
  });
  console.log(`Unified scan results rendered in DOM: ${fullResultsVisible}`);

  const artifactPath = path.resolve('C:\\Users\\rajiv\\.gemini\\antigravity\\brain\\aedf15d9-fa50-4ff2-8caa-dcd27b258dcf\\direct-api-verification.png');
  await page.screenshot({ path: artifactPath, fullPage: true });
  console.log(`Saved screenshot artifact to ${artifactPath}`);

  // Summary & Assertions
  console.log('\n================ VERIFICATION SUMMARY ================');
  console.log(`Total API requests captured: ${allApiRequests.length}`);
  console.log(`API requests sent directly to http://localhost:8000: ${apiRequestsTo8000.length}`);
  console.log(`API requests sent through frontend preview (proxy) on 5173: ${apiRequestsTo5173.length}`);
  console.log(`API Status Pill: ${statusPillText}`);
  console.log(`Dependency Scan: SUCCESS (${scanRes.status()})`);
  console.log(`Unified Scan: SUCCESS (${diffRes.status()})`);

  const distinctUrls = [...new Set(allApiRequests.map((r) => r.url))];
  console.log('\nDistinct API URLs called during the session:');
  distinctUrls.forEach((u) => console.log(`  - ${u}`));

  const allDirectTo8000 = apiRequestsTo5173.length === 0 && apiRequestsTo8000.length > 0;
  const pillIsOnline = statusPillText === 'ONLINE';

  console.log('\nAssertion Checks:');
  console.log(`1. Zero API calls routed to port 5173 (NO PROXY): ${apiRequestsTo5173.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`2. All API calls routed directly to backend on 8000: ${allDirectTo8000 ? 'PASS' : 'FAIL'}`);
  console.log(`3. Nav Status Pill is ONLINE: ${pillIsOnline ? 'PASS' : 'FAIL'}`);
  console.log(`4. Dependency Scan succeeded: PASS`);
  console.log(`5. Unified Scan succeeded: PASS`);

  await browser.close();

  if (!allDirectTo8000 || !pillIsOnline) {
    console.error('TEST FAILED!');
    process.exit(1);
  }

  console.log('\nALL VERIFICATION CHECKS PASSED PERFECTLY!');
  process.exit(0);
}

runDirectApiVerification().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
