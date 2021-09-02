// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, Notification } = require("electron");
const fetch = require("node-fetch");
const fs = require("fs");
const requestImageSize = require("request-image-size");

const download = require("image-downloader");

const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const pie = require("puppeteer-in-electron");
const puppeteer = require("puppeteer-core");
(async () => {
  await pie.initialize(app);
})();

const adapter = new FileSync("db.json");
const db = low(adapter);
db.defaults({ data: [] }).write();

let mainWindow;
function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 650,
    resizable: false,
    resizable: false,
    webPreferences: {
      // preload: path.join(__dirname, 'preload.js')
      nodeIntegration: true,
    },
  });

  mainWindow.loadFile("./page/index.html");
  mainWindow.on("close", function (event) {
    app.quit();
  });
}

ipcMain.on("post-pin", async (e, arg) => {
  if (!fs.existsSync("../images")) {
    fs.mkdirSync("../images");
  }

  const browser = await pie.connect(app, puppeteer);

  const win = new BrowserWindow({
    width: 800,
    height: 650,
    show: arg.hidden == "false" ? true : false,
    webPreferences: {
      nodeIntegration: true,
    },
  });
  if (arg.hidden == "false") {
    win.maximize();
  }

  const ses = win.webContents.session;
  await ses.clearAuthCache();
  await ses.clearCache();
  await ses.clearStorageData();

  try {
    const page = await pie.getPage(browser, win);

    mainWindow.webContents.send("update", `opening pinterest`);
    try {
      await page.goto("https://pinterest.com/", {
        timeout: 0,
      });
    } catch (error) {
      console.log(error);
    }
    ///////////////////////////////////////////////////////////////////////
    mainWindow.webContents.send("update", `login to ${arg.username}`);
    await page.waitForSelector('[data-test-id="simple-login-button"] button');
    console.log("not logged in");
    await page.evaluate(() => {
      document
        .querySelector('[data-test-id="simple-login-button"] button')
        .click();
    });

    await page.waitForSelector("button[type='submit']");
    await page.waitFor(1000);

    await page.evaluate(() => {
      if (document.querySelector('[data-test-id="login-switch-account"] a')) {
        document
          .querySelector('[data-test-id="login-switch-account"] a')
          .click();
      }
    });

    await page.waitFor(1000);

    let userInput = await page.waitForSelector("input#email");
    await userInput.type(arg.username, { delay: 100 });

    let passInput = await page.waitForSelector("input#password");
    await passInput.type(arg.pass, { delay: 100 });

    await page.waitFor(1000);

    await page.evaluate(() => {
      document.querySelector("button[type='submit']").click();
    });

    await page.waitForSelector(
      '[data-test-id="header-accounts-options-button"] button',
      {
        timeout: 0,
      }
    );
    ////////////////////////////////////////////////////////////////////////////////
    for (let j = 0; j < arg.data.length; j++) {
      const list = arg.data[j];
      try {
        mainWindow.webContents.send("update", `downloading the image`);
        const size = await requestImageSize(list.img);
        if (size.width >= 200 && size.height >= 300) {
          await download.image({
            url: list.img,
            dest: `../images/image-${j}.${
              list.img.split(".")[list.img.split(".").length - 1]
            }`,
          });
        } else {
          if (arg.resize !== "true") {
            continue;
          }

          await page.goto(list.img, {
            timeout: 0,
          });
          await page.evaluate(() => {
            document.querySelector("img").height = 300;
            document.querySelector("img").width = 300;
          });
          const img = await page.waitForSelector("img");
          await img.screenshot({
            path: `../images/image-${j}.${
              list.img.split(".")[list.img.split(".").length - 1]
            }`,
          });
        }
      } catch (error) {
        console.log(error);
      }
      try {
        mainWindow.webContents.send("update", `creating a pin`);
        await page.goto("https://www.pinterest.com/pin-builder/", {
          timeout: 0,
        });
        console.log("page fully loaded");
        await page.waitForSelector(
          'button[data-test-id="board-dropdown-select-button"]',
          {
            timeout: 0,
          }
        );
        await page.waitFor(1000);
        await page.evaluate(() => {
          const loop = setInterval(() => {
            if (
              document.querySelector(
                'button[data-test-id="board-dropdown-select-button"]'
              )
            ) {
              document
                .querySelector(
                  'button[data-test-id="board-dropdown-select-button"]'
                )
                .click();

              clearInterval(loop);
            }
          }, 200);
        });

        const bd = `[data-test-id="boardWithoutSection"] [title="${arg.board}"]`;
        await page.waitForSelector(bd, {
          timeout: 0,
        });
        await page.waitFor(1000);
        await page.evaluate((bd) => {
          const loop = setInterval(() => {
            if (document.querySelector(bd)) {
              document
                .querySelector(bd)
                .parentElement.parentElement.parentElement.click();

              clearInterval(loop);
            }
          }, 200);
        }, bd);

        mainWindow.webContents.send("update", `uploading the image`);
        const [fileChooser] = await Promise.all([
          page.waitForFileChooser(),
          page.click("[id^='media-upload-input']"),
        ]);
        await fileChooser.accept([
          `../images/image-${j}.${
            list.img.split(".")[list.img.split(".").length - 1]
          }`,
        ]);

        let titleInput = await page.waitForSelector(
          'textarea[id^="pin-draft-title"]'
        );
        await page.waitFor(1000);
        mainWindow.webContents.send("update", `typing the title`);
        await titleInput.type(list.title.substring(0, 100), { delay: 10 });
        await page.keyboard.press("Tab");

        await page.waitFor(500);
        mainWindow.webContents.send("update", `typing the description`);
        const description = list.newDesc
          ? list.newDesc
          : list.desc.substring(0, 500);

        const newString = description.replace(
          /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/g,
          ""
        );
        await page.keyboard.type(newString, { delay: 10 });

        const today = new Date();
        const date =
          today.getFullYear() +
          "-" +
          (today.getMonth() + 1) +
          "-" +
          today.getDate();
        if (list.link.includes("fiverr")) {
          if (arg.shortLink === "true") {
            const resp = await fetch("https://dealsingo.com/api/url", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key":"GzGcrUu9FBm8^^aU58?y3GD^=g7V9-D1-ftn!S$kNHnh%6D?L#-D1-DbmQ"
              },
              body: JSON.stringify({
                link: `https://track.fiverr.com/visit/?bta=${arg.affiliateID}&brand=fiverrcpa&landingPage=${list.link}`,
                img: list.img,
                desc: list.desc,
                title: list.title,
                board: arg.board,
                user: arg.username,
                date,
              }),
            });

            const { name: shortID } = await resp.json();
            await page.keyboard.press("Tab");
            await page.waitFor(500);
            await page.keyboard.press("Tab");
            await page.waitFor(500);
            mainWindow.webContents.send("update", `entering the url`);
            await page.keyboard.type(`https://dealsingo.com/${shortID}`, {
              delay: 50,
            });
          } else {
            await page.keyboard.press("Tab");
            await page.waitFor(500);
            await page.keyboard.press("Tab");
            await page.waitFor(500);
            mainWindow.webContents.send("update", `entering the url`);
            await page.keyboard.type(
              `https://track.fiverr.com/visit/?bta=${arg.affiliateID}&brand=fiverrcpa&landingPage=${list.link}`,
              {
                delay: 50,
              }
            );
          }
        } else {
          if (arg.shortLink === "true") {
            const resp = await fetch("https://dealsingo.com/api/url", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key":"GzGcrUu9FBm8^^aU58?y3GD^=g7V9-D1-ftn!S$kNHnh%6D?L#-D1-DbmQ"
              },
              body: JSON.stringify({
                link: list.link,
                img: list.img,
                desc: list.desc,
                title: list.title,
                board: arg.board,
                user: arg.username,
                date,
              }),
            });

            const { name: shortID } = await resp.json();
            await page.keyboard.press("Tab");
            await page.waitFor(500);
            await page.keyboard.press("Tab");
            await page.waitFor(500);
            mainWindow.webContents.send("update", `entering the url`);
            await page.keyboard.type(`https://dealsingo.com/${shortID}`, {
              delay: 50,
            });
          } else {
            await page.keyboard.press("Tab");
            await page.waitFor(500);
            await page.keyboard.press("Tab");
            await page.waitFor(500);
            mainWindow.webContents.send("update", `entering the url`);
            await page.keyboard.type(list.link, {
              delay: 50,
            });
          }
        }

        await page.evaluate(() => {
          document
            .querySelector('button[data-test-id="board-dropdown-save-button"]')
            .click();
        });

        try {
          await page.waitForSelector('svg[aria-label="Saving Pin..."]');
          await page.waitForFunction(
            () => !document.querySelector('svg[aria-label="Saving Pin..."]')
          );
        } catch (err) {
          console.log(err);
        }
        const sec = parseInt(arg.delay) + Math.floor(Math.random() * 10) + 1;
        mainWindow.webContents.send("update", `waiting ${sec} seconds`);
        mainWindow.webContents.send("progress", list.link);
        await page.waitFor(sec * 1000);
      } catch (error) {
        mainWindow.webContents.send("error", error);
      }
    }
  } catch (error) {
    console.log(error);
  }

  mainWindow.webContents.send("finished");
  win.close();

  const myNotification = new Notification({
    title: "Auto Pinner",
    body: "the task is finished",
    icon: "./page/icon.png",
  });
  myNotification.show();
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
