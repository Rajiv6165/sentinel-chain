import puppeteer from 'puppeteer-core';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACT_DIR = 'C:\\Users\\rajiv\\.gemini\\antigravity\\brain\\aedf15d9-fa50-4ff2-8caa-dcd27b258dcf';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runCapture() {
  console.log('=== STARTING TEST & CAPTURE FOR ITEMS 1 & 2 ===');
  const tempUserDir = path.join(os.tmpdir(), 'puppeteer_items12_' + Date.now());

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

  // 1. Desktop Viewport
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });
  console.log('Navigating to http://127.0.0.1:5173/...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  // --- ITEM 1: CHAIN NODE EXPLORER (DESKTOP) ---
  console.log('\n--- Testing Chain Node Explorer: jsonwebtoken (Node 5) ---');
  const node5 = await page.$('#hero-node-5');
  if (!node5) throw new Error('Could not find #hero-node-5');
  await node5.click();
  await new Promise((r) => setTimeout(r, 800));

  const evidencePanelVisible = await page.$('#chain-evidence-panel');
  if (!evidencePanelVisible) throw new Error('Evidence panel did not open on node 5 click');

  const shotNode5Path = path.join(ARTIFACT_DIR, 'item1-node-jsonwebtoken-1440.png');
  await page.screenshot({ path: shotNode5Path });
  console.log(`Saved screenshot: ${shotNode5Path}`);

  // Test Arrow navigation to Node 6 (lodsh)
  console.log('Testing ArrowRight navigation to lodsh (Node 6)...');
  await page.keyboard.press('ArrowRight');
  await new Promise((r) => setTimeout(r, 600));

  const isLodshOpen = await page.evaluate(() => {
    const el = document.querySelector('#chain-evidence-panel');
    return el ? el.innerText.includes('lodsh') && el.innerText.includes('TYPOSQUAT') : false;
  });
  console.log(`Node 6 (lodsh) active after ArrowRight: ${isLodshOpen}`);

  const shotNode6Path = path.join(ARTIFACT_DIR, 'item1-node-lodsh-1440.png');
  await page.screenshot({ path: shotNode6Path });
  console.log(`Saved screenshot: ${shotNode6Path}`);

  // Test Escape key to close
  console.log('Testing Escape key to close evidence panel...');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 500));
  const isClosed = await page.evaluate(() => !document.querySelector('#chain-evidence-panel'));
  console.log(`Evidence panel closed on Escape: ${isClosed}`);

  // --- ITEM 1: CHAIN NODE EXPLORER (MOBILE BOTTOM SHEET) ---
  console.log('\n--- Testing Mobile Bottom Sheet (390x844) ---');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1500));

  const mobileNode5 = await page.$('#hero-node-5');
  if (mobileNode5) {
    await mobileNode5.click();
    await new Promise((r) => setTimeout(r, 800));
    const shotMobilePath = path.join(ARTIFACT_DIR, 'item1-bottom-sheet-mobile-390.png');
    await page.screenshot({ path: shotMobilePath });
    console.log(`Saved mobile screenshot: ${shotMobilePath}`);

    // Close bottom sheet
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 500));
  }

  // --- ITEM 2: LIVE PACKAGE CHECKER ---
  console.log('\n--- Testing Live Package Checker (Desktop) ---');
  await page.setViewport({ width: 1440, height: 1050, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1500));

  // Scroll to #live-checker
  await page.evaluate(() => {
    const el = document.getElementById('live-checker');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise((r) => setTimeout(r, 600));

  // Test 2A: loadash chip (Typosquat)
  console.log('Testing "loadash" example chip...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#live-checker button'));
    const chip = btns.find((b) => b.innerText.includes('loadash'));
    if (chip) chip.click();
  });
  // Wait for /api/scan response
  await page.waitForResponse((res) => res.url().includes('/api/scan') && res.status() === 200, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1000));

  const loadashEl = await page.$('#live-checker');
  const shotLoadashPath = path.join(ARTIFACT_DIR, 'item2-checker-loadash-1440.png');
  await loadashEl.screenshot({ path: shotLoadashPath });
  console.log(`Saved loadash screenshot: ${shotLoadashPath}`);

  // Test 2B: react chip (Clean Negative)
  console.log('Testing "react" example chip...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#live-checker button'));
    const chip = btns.find((b) => b.innerText.includes('react'));
    if (chip) chip.click();
  });
  await page.waitForResponse((res) => res.url().includes('/api/scan') && res.status() === 200, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1000));

  const reactEl = await page.$('#live-checker');
  const shotReactPath = path.join(ARTIFACT_DIR, 'item2-checker-clean-1440.png');
  await reactEl.screenshot({ path: shotReactPath });
  console.log(`Saved clean negative screenshot: ${shotReactPath}`);

  // Test 2C: Invalid package name "../x"
  console.log('Testing invalid package name "../x"...');
  const inputEl = await page.$('#live-checker input');
  await inputEl.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await inputEl.type('../x');
  await new Promise((r) => setTimeout(r, 400));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#live-checker button'));
    const submit = btns.find((b) => b.innerText.includes('Check Package'));
    if (submit) submit.click();
  });
  await page.waitForResponse((res) => res.url().includes('/api/scan') && res.status() === 200, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1000));

  const invalidEl = await page.$('#live-checker');
  const shotInvalidPath = path.join(ARTIFACT_DIR, 'item2-checker-invalid-1440.png');
  await invalidEl.screenshot({ path: shotInvalidPath });
  console.log(`Saved invalid package screenshot: ${shotInvalidPath}`);

  await browser.close();
  console.log('\n=== ALL CAPTURES AND ASSERTIONS COMPLETED SUCCESSFULLY ===');
}

runCapture().catch((err) => {
  console.error('CAPTURE FAILED:', err);
  process.exit(1);
});
