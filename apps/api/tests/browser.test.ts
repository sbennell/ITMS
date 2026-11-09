import assert from 'node:assert/strict';
import { existsSync } from 'fs';
import path from 'path';
import { after, before, describe, test } from 'node:test';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import { PASSWORD, startServer, TestServer, waitFor } from './helpers';

// Runs against the built web app, in the installed Chrome or Edge
const BROWSER_PATH = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].find((candidate) => candidate && existsSync(candidate));
const WEB_BUILD = path.join(__dirname, '../../web/dist/index.html');
const skip = !BROWSER_PATH
  ? 'No Chrome or Edge found (set CHROME_PATH)'
  : !existsSync(WEB_BUILD)
    ? 'Web app is not built (run npm run build)'
    : false;

const SECRET = 'BROWSER-SECRET';
const TIMEOUT = 15000;

describe('browser screens', { skip }, () => {
  let server: TestServer;
  let browser: Browser;
  let admin: string;

  before(async () => {
    server = await startServer({ production: true });
    admin = await server.login('admin');
    browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--no-sandbox'] });
  });
  after(async () => {
    await browser.close();
    await server.stop();
  });

  const open = async (urlPath: string, cookie = admin): Promise<Page> => {
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);
    const [name, value] = cookie.split('=');
    await browser.setCookie({ name, value, domain: '127.0.0.1', path: '/' });
    await page.goto(server.origin + urlPath, { waitUntil: 'networkidle0' });
    return page;
  };
  const seeText = (page: Page, text: string) =>
    page.waitForFunction((t: string) => document.body.innerText.includes(t), { timeout: TIMEOUT }, text);
  const createAsset = async (itemNumber: string, extra: object = {}) =>
    (await server.call('POST', '/assets', admin, { itemNumber, ...extra })).json();
  const devicePassword = async (id: string) =>
    (await server.prisma.asset.findUniqueOrThrow({ where: { id } })).devicePassword;

  const saveEditForm = async (page: Page, id: string) => {
    await page.click('button[type=submit]');
    await page.waitForFunction((target: string) => location.pathname === target, { timeout: TIMEOUT }, `/assets/${id}`);
  };
  const openEditForm = async (id: string) => {
    const page = await open(`/assets/${id}/edit`);
    await page.waitForFunction(() => (document.querySelector('input[name=itemNumber]') as HTMLInputElement)?.value);
    return page;
  };

  test('the device password is only shown after the account password is entered', async () => {
    const asset = await createAsset('B-REVEAL', { devicePassword: SECRET });
    const page = await open(`/assets/${asset.id}`);
    assert.ok(!(await page.content()).includes(SECRET));

    await page.click('button[title="Show password"]');
    await page.type('input[placeholder="Your account password"]', 'wrong-password');
    await page.click('form button[type=submit]');
    await seeText(page, 'Incorrect password');
    assert.ok(!(await page.content()).includes(SECRET));

    await page.type('input[placeholder="Your account password"]', PASSWORD);
    await page.click('form button[type=submit]');
    await seeText(page, SECRET);
    await page.close();
  });

  test('saving the edit form with a blank password keeps it', async () => {
    const asset = await createAsset('B-KEEP', { devicePassword: SECRET });
    const page = await openEditForm(asset.id);
    await saveEditForm(page, asset.id);

    assert.equal(await devicePassword(asset.id), SECRET);
    await page.close();
  });

  test('the edit form can remove a password', async () => {
    const asset = await createAsset('B-REMOVE', { devicePassword: SECRET });
    const page = await openEditForm(asset.id);
    await page.click('#removeDevicePassword');
    await saveEditForm(page, asset.id);

    assert.equal(await devicePassword(asset.id), null);
    await page.close();
  });

  test('a selection spans pages and clears when the filter changes', async () => {
    for (const item of ['S-1', 'S-2', 'S-3', 'S-4']) await createAsset(item, { model: 'Selectable' });
    const page = await open('/assets?limit=2&search=Selectable');

    await page.click('tbody input[type=checkbox]');
    await seeText(page, '(1 selected)');

    await page.click('button:has(svg.lucide-chevron-right)');
    await page.waitForFunction(() => location.search.includes('page=2'));
    await page.waitForNetworkIdle();
    await page.click('tbody input[type=checkbox]');
    await seeText(page, '(2 selected)');

    await page.click('input[placeholder="Search assets..."]', { count: 3 });
    await page.type('input[placeholder="Search assets..."]', 'S-1');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.body.innerText.includes('selected)'));
    await page.close();
  });

  test('completing a stocktake asks first', async () => {
    await createAsset('B-STOCK');
    const stocktake = (await server.call('POST', '/stocktakes', admin, { name: 'Browser Count' })).json();
    const status = async () => (await server.prisma.stocktake.findUniqueOrThrow({ where: { id: stocktake.id } })).status;

    const page = await open('/stocktake');
    await page.locator('::-p-text(Browser Count)').click();
    await seeText(page, 'Quick Verify');

    let accept = false;
    page.on('dialog', (dialog) => (accept ? dialog.accept() : dialog.dismiss()));

    await page.locator('button::-p-text(Complete)').click();
    await page.waitForNetworkIdle();
    assert.equal(await status(), 'IN_PROGRESS');

    accept = true;
    await page.locator('button::-p-text(Complete)').click();
    assert.equal(await waitFor(async () => (await status()) === 'COMPLETED', TIMEOUT), true);
    await page.close();
  });

  test('an ended session returns to the login page', async () => {
    const user = await server.createUser(admin, 'browser-user');
    const page = await open('/assets', await server.login('browser-user'));
    await seeText(page, 'Hardware Assets');

    await server.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await page.type('input[placeholder="Search assets..."]', 'anything');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.pathname === '/login');
    await page.close();
    await browser.deleteCookie(...(await browser.cookies()));
  });

  test('the Login Card button only shows with permission to use it', async () => {
    const student = (await server.call('POST', '/students', admin, { firstName: 'Card', surname: 'Holder' })).json();
    await server.createUser(admin, 'no-cards');

    const allowed = await open(`/students/${student.id}`);
    await seeText(allowed, 'Account Details');
    await seeText(allowed, 'Login Card');
    await allowed.close();

    const denied = await open(`/students/${student.id}`, await server.login('no-cards'));
    await seeText(denied, 'Account Details');
    assert.ok(!(await denied.evaluate(() => document.body.innerText)).includes('Login Card'));
    await denied.close();
  });
});
