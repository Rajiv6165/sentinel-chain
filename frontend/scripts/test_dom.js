import puppeteer from 'puppeteer-core';
import path from 'path';
import os from 'os';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function check() {
  const tempUserDir = path.join(os.tmpdir(), 'puppeteer_shot_test_' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: tempUserDir,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });

  const info = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
    const sections = Array.from(document.querySelectorAll('section')).map((s) => ({
      id: s.id,
      className: s.className
    }));
    return { ids, sections };
  });

  console.log('DOM Info:', info);
  await browser.close();
  try {
    fs.rmSync(tempUserDir, { recursive: true, force: true });
  } catch (_) {}
}

check().catch(console.error);
