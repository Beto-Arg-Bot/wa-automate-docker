#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * Taken from https://github.com/browserless/chrome/blob/master/scripts/postinstall.js
 * 
 * By @joelgriffith
 */
import * as cp from 'child_process'
// @ts-ignore
const nodeExec = cp.default.exec
import os from 'os'
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import * as path from 'path'
import { promisify } from 'util'
import extract from 'extract-zip';
// @ts-ignore
import fs from 'fs-extra'
// @ts-ignore
import * as _ from 'lodash'
// @ts-ignore
import fetch from 'node-fetch';
// @ts-ignore
import { installBrowsersForNpmInstall } from 'playwright-core/lib/server'
import puppeteer from 'puppeteer'
// @ts-ignore
import rimraf from 'rimraf'
// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));

const execAsync = promisify(nodeExec);
const hostsJson = path.join(__dirname, '..', 'hosts.json');
console.log("🚀 ~ file: postinstall.js ~ line 26 ~ hostsJson", hostsJson)
console.log("🚀 ~ file: postinstall.js ~ line 26 ~ __dirname", __dirname)

const exec = async (command) => {
  const { stdout, stderr } = await execAsync(command);

  if (stderr.trim().length) {
    console.error(stderr);
    return process.exit(1);
  }

  return stdout.trim();
};
import _env from '../env.js'
console.log(_env)
const {
  CHROME_BINARY_LOCATION,
  IS_DOCKER,
  USE_CHROME_STABLE,
  PUPPETEER_CHROMIUM_REVISION,
  PUPPETEER_BINARY_LOCATION,
  PLATFORM,
  WINDOWS,
  MAC,
  LINUX_ARM64,
} = _env

const browserlessTmpDir = path.join(
  os.tmpdir(),
  `browserless-devtools-${Date.now()}`,
);

const IS_LINUX_ARM64 = PLATFORM === LINUX_ARM64;

// @TODO: Fix this revision once devtools app works again
const devtoolsUrl = `https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/Mac%2F848005%2Fdevtools-frontend.zip?alt=media`;
const chromedriverUrl = (() => {
  if (PLATFORM === MAC)
    return `https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/Mac%2F${PUPPETEER_CHROMIUM_REVISION}%2Fchromedriver_mac64.zip?alt=media`;
  if (PLATFORM === WINDOWS)
    return `https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/Win%2F${PUPPETEER_CHROMIUM_REVISION}%2Fchromedriver_win32.zip?alt=media`;

  // Linux
  return `https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/Linux_x64%2F${PUPPETEER_CHROMIUM_REVISION}%2Fchromedriver_linux64.zip?alt=media`;
})();

const downloadUrlToDirectory = (url, dir) => {
    console.log(`Downloading ${url} to ${dir}`);
    // return exec(`wget ${url} -p ${dir}`);
  return fetch(url).then(
    (response) =>
      new Promise((resolve, reject) => {
        response.body
          .pipe(fs.createWriteStream(dir))
          .on('error', reject)
          .on('finish', resolve);
      }),
  );
}
const unzip = async (source, target) => extract(source, { dir: target });
const move = async (src, dest) => fs.move(src, dest, { overwrite: true });
const waitForFile = async (filePath) =>
  new Promise((resolve, reject) => {
    let responded = false;
    const done = (error) => {
      if (responded) return;
      responded = true;
      clearInterval(interval);
      clearTimeout(timeout);
      return error ? reject(error) : resolve();
    };

    const interval = setInterval(() => fs.existsSync(filePath) && done(), 100);
    const timeout = setTimeout(
      () => done(`Timeout waiting for file ${filePath}`),
      5000,
    );
  });

const downloadChromium = () => {
  if (USE_CHROME_STABLE && IS_LINUX_ARM64) {
    throw new Error(`Chrome stable isn't supported for linux-arm64`);
  }

  if (IS_LINUX_ARM64) {
    return installBrowsersForNpmInstall(['chromium']);
  }

  if (USE_CHROME_STABLE) {
    console.log('Using chrome stable, not proceeding with chromium download');
    return Promise.resolve();
  }

  console.log(
    `Downloading chromium for revision ${PUPPETEER_CHROMIUM_REVISION}`,
  );

  // @ts-ignore
  return puppeteer.createBrowserFetcher().download(PUPPETEER_CHROMIUM_REVISION);
};

const downloadChromedriver = () => {
  if (USE_CHROME_STABLE) {
    console.log(
      'chromedriver binary already installed, not proceeding with chromedriver',
    );
    return Promise.resolve();
  }

  console.log(
    `Downloading chromedriver for revision ${PUPPETEER_CHROMIUM_REVISION}`,
  );

  const chromedriverZipFolder = (() => {
    if (PLATFORM === MAC) return 'chromedriver_mac64';
    if (PLATFORM === WINDOWS) return 'chromedriver_win32';
    return 'chromedriver_linux64'; // Linux
  })();

  const chromedriverTmpZip = path.join(browserlessTmpDir, `chromedriver`);
  const chromedriverBin = `chromedriver${PLATFORM === WINDOWS ? '.exe' : ''}`;
  const chromedriverUnzippedPath = path.join(
    browserlessTmpDir,
    chromedriverZipFolder,
    chromedriverBin,
  );
  const chromedriverFinalPath = path.join(
    __dirname,
    '..',
    'node_modules',
    'chromedriver',
    'lib',
    'chromedriver',
    'chromedriver',
  );

  return downloadUrlToDirectory(chromedriverUrl, chromedriverTmpZip)
    .then(() => waitForFile(chromedriverTmpZip))
    .then(() => unzip(chromedriverTmpZip, browserlessTmpDir))
    .then(() => waitForFile(chromedriverUnzippedPath))
    .then(() => move(chromedriverUnzippedPath, chromedriverFinalPath))
    .then(() => fs.chmod(chromedriverFinalPath, '755'))
    .then(() => waitForFile(chromedriverFinalPath));
};

const downloadDevTools = () => {
  console.log(
    `Downloading devtools assets for revision ${PUPPETEER_CHROMIUM_REVISION}`,
  );
  const devtoolsTmpZip = path.join(browserlessTmpDir, 'devtools');
  const devtoolsUnzippedPath = path.join(
    browserlessTmpDir,
    'devtools-frontend',
    'resources',
    'inspector',
  );
  const devtoolsFinalPath = path.join(__dirname, '..', 'devtools');

  return downloadUrlToDirectory(devtoolsUrl, devtoolsTmpZip)
    .then(() => waitForFile(devtoolsTmpZip))
    .then(() => unzip(devtoolsTmpZip, browserlessTmpDir))
    .then(() => waitForFile(devtoolsUnzippedPath))
    .then(() => move(devtoolsUnzippedPath, devtoolsFinalPath))
    .then(() => waitForFile(devtoolsFinalPath));
};

(() =>
  new Promise(async (resolve, reject) => {
    try {
      await fs.mkdir(browserlessTmpDir);

      await Promise.all([
        downloadChromium(),
        downloadChromedriver(),
        downloadDevTools(),
      ]);

      // If we're in docker, and this isn't a chrome-stable build,
      // symlink where chrome-stable should be back to puppeteer's build
      if (IS_DOCKER && !fs.existsSync(CHROME_BINARY_LOCATION)) {
        if (!USE_CHROME_STABLE && !fs.existsSync(PUPPETEER_BINARY_LOCATION)) {
          throw new Error(
            `Couldn't find chromium at path: "${PUPPETEER_BINARY_LOCATION}"`,
          );
        }

        (async () => {
          console.log(
            `Symlinking chrome from ${CHROME_BINARY_LOCATION} to ${PUPPETEER_BINARY_LOCATION}`,
          );
          await exec(
            `ln -s ${PUPPETEER_BINARY_LOCATION} ${CHROME_BINARY_LOCATION}`,
          );
        })();
      }
    } catch (err) {
      console.error(`Error unpacking assets:\n${err.message}\n${err.stack}`);
      reject(err);
      process.exit(1);
    } finally {
      rimraf(browserlessTmpDir, (err) => {
        console.log('Done unpacking chromedriver and devtools assets');
        if (err)
          console.warn(
            `Error removing temporary directory ${browserlessTmpDir}`,
          );
        resolve();
      });
    }
  }))();
