import puppeteer from 'puppeteer-core';
import path from 'path';
import os from 'os';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testReact() {
  const tempUserDir = path.join(os.tmpdir(), 'puppeteer_shot_debug_' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: tempUserDir,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
  page.on('console', (msg) => console.log('PAGE CONSOLE:', msg.type(), msg.text()));

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1000));

  console.log('Now clicking "Try sample"...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((el) => el.textContent.includes('Try sample'));
    if (b) b.click();
    else console.error('Try sample button not found!');
  });

  await new Promise((r) => setTimeout(r, 1500));
  await browser.close();
  try {
    fs.rmSync(tempUserDir, { recursive: true, force: true });
  } catch (_) {}
}

testReact().catch(console.error);
