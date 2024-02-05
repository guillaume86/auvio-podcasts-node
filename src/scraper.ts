import puppeteer from "puppeteer";
import { logger } from "./logger.js";
import { AUVIO_CREDENTIALS, DISABLE_SANDBOX, USER_DATA_DIR } from "./config.js";

type RedbeePlayResponse = {
  formats: {
    format: string;
    mediaLocator: string;
  }[];
};

// interface Episode {
//   title: string;
//   description: string;
//   date: string;
//   url: string;
// }

let currentTask = Promise.resolve("");

export async function scrapeUrl(
  auvioPodcastURL: string,
  mediaId: string,
  publishedFrom: number,
) {
  currentTask = currentTask.then(async () => {
    const mediaURL = await doScrapeUrl(auvioPodcastURL, mediaId, publishedFrom);
    return mediaURL;
  });
  return currentTask;
}

export async function doScrapeUrl(
  auvioPodcastURL: string,
  mediaId: string,
  publishedFrom: number,
) {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    //headless: false,
    headless: "new",
    args: DISABLE_SANDBOX ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
    userDataDir: USER_DATA_DIR,
  });
  const page = await browser.newPage();
  await page.setRequestInterception(true);

  // Set screen size
  await page.setViewport({ width: 1440, height: 1024 });

  const episodesInterceptedCallback = { current: function (data: any) {} };

  function waitForEpisodesIntercepted(timeout = 10000) {
    return new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => {
        reject(new Error("Timeout"));
      }, timeout);

      episodesInterceptedCallback.current = (data) => {
        clearTimeout(t);
        resolve(data);
      };
    });
  }

  const mp3InterceptedCallback = { current: function (url: string) {} };

  function waitForMp3Intercepted(timeout = 10000) {
    return new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => {
        reject(new Error("Timeout"));
      }, timeout);

      mp3InterceptedCallback.current = (mp3Url) => {
        clearTimeout(t);
        resolve(mp3Url);
      };
    });
  }

  page.on("request", (interceptedRequest) => {
    if (interceptedRequest.isInterceptResolutionHandled()) {
      return;
    }

    if (interceptedRequest.url().includes(".mp3")) {
      logger.debug("Aborting mp3 request %s", interceptedRequest.url());
      mp3InterceptedCallback.current?.(interceptedRequest.url());
      interceptedRequest.abort();
      return;
    }

    interceptedRequest.continue();
  });

  // workaround for a bug which prevents playing the mp3
  page.on("response", (res) => {
    //logger.debug("Response: " + res.url());
    if (res.status() === 200 && res.request().method() === "GET") {
      if (
        res.url().startsWith("https://exposure.api.redbee.live/v2/") &&
        res.url().includes("/entitlement/") && res.url().includes("/play?") &&
        res.url().includes("&awEpisodeId=") &&
        res.url().includes("&supportedFormats=")
      ) {
        logger.debug("Intercepted mp3 request %s", res.url());
        res.json().then((json: RedbeePlayResponse) => {
          const url = json.formats[0].mediaLocator;
          mp3InterceptedCallback.current?.(url);
        }, (err) => {
          logger.error("Error parsing JSON: %s", err);
        });
      }

      // https://bff-service.rtbf.be/auvio/v1.21/widgets/18800?context%5BprogramId%5D=
      if (
        res.url().startsWith(
          "https://bff-service.rtbf.be/auvio/v",
        ) && res.url().includes("/widgets/18800?context%5BprogramId%5D=")
      ) {
        logger.debug("Intercepted episodes data: " + res.url());
        res.json().then((json) => {
          episodesInterceptedCallback.current?.(json);
        }, (err) => {
          logger.error("Error parsing JSON: %s", err);
        });
      }
    }
  });

  const episodesIntercepted = waitForEpisodesIntercepted();

  // Navigate the page to a URL
  logger.debug("Navigating to podcast page %s", auvioPodcastURL);
  await page.goto(auvioPodcastURL);

  await page.waitForNetworkIdle();

  // Accept cookies
  try {
    logger.debug("Accepting cookies...");
    await page.waitForSelector("#didomi-notice-agree-button", {
      timeout: 200,
    });
    await page.click("#didomi-notice-agree-button");
  } catch (e) {
    logger.debug("No cookie popup");
  }

  // HeaderUser_text__
  const userHeaderText = await page.waitForSelector(
    "[class^='HeaderUser_text__']",
  ).then((el) => el?.evaluate((el) => el.innerText));

  if (userHeaderText === "Se connecter") {
    // Click on user menu button
    logger.debug("Clicking on user menu button...");
    await page.click("#headerUserButton");

    // Click on login button
    logger.debug("Clicking on login button...");
    await page.waitForSelector("#menuItem-LOGIN");
    await page.click("#menuItem-LOGIN");

    // Wait for login form to appear
    logger.debug("Waiting for login form...");
    await page.waitForSelector("input[name='loginID']");

    // Type the login and password
    logger.debug("Typing login and password...");
    await page.type("input[name='loginID']", AUVIO_CREDENTIALS.email);
    await page.type("input[name='password']", AUVIO_CREDENTIALS.password);

    // Click on login button
    logger.debug("Clicking on login button...");
    await page.click("input[type='submit']");

    await page.waitForNetworkIdle();
  } else {
    logger.debug("Already logged in");
  }

  // Scroll to the bottom of the page
  logger.debug("Scrolling to the bottom of the page...");
  await page.evaluate(() => {
    // @ts-ignore
    window.scrollBy(0, window.innerHeight);
  });

  // Wait for the page to load
  await page.waitForNetworkIdle();

  const episodesData = await episodesIntercepted;
  const episode = episodesData.data.content.find((item: any) =>
    Date.parse(item.publishedFrom) === publishedFrom
  );
  episode.url = new URL(episode.path, "https://auvio.rtbf.be/").href;

  logger.debug(`Found episode: ${episode.title}`);
  //logger.debug(episode);

  // // Extract title /
  // logger.debug("Extracting episodes...");
  // const episodes = await page.evaluate(() => {
  //   const episodes = Array.from(
  //     // @ts-ignore
  //     document.querySelectorAll("[class^=TileEpisode_podcastTile__]"),
  //   ) as any[];
  //   return episodes.map((episode): Episode => {
  //     const title = episode.querySelector(
  //       "[class^=TileEpisode_podcastTitle__]",
  //     ).innerText;
  //     const description = episode.querySelector(
  //       "[class^=TileEpisode_podcastDescription__]",
  //     ).innerText;
  //     const date = episode.querySelector(
  //       "[class^=TileEpisode_broadcastDate__]",
  //     ).innerText;
  //     const url = episode.querySelector(
  //       "[class*=TileEpisode_podcastDetailsButton__]",
  //     ).href;
  //     return {
  //       title,
  //       description,
  //       date,
  //       url,
  //     };
  //   });
  // });

  // logger.debug(episodes);

  // const episode = episodes.find((episode) => episode.url.endsWith(mediaId));

  if (!episode) {
    throw new Error("Episode not found");
  }

  // Navigate to the first episode page
  logger.debug("Navigating to episode page %s...", episode.url);
  await page.goto(episode.url);

  // Wait for the page to load
  await page.waitForNetworkIdle();

  // Prepare to intercept mp3 request
  const mp3Intercepted = waitForMp3Intercepted();

  // Click on the play button
  logger.debug("Clicking on play button...");
  await page.waitForSelector("#detailsButton-listen");
  await page.click("#detailsButton-listen");

  // Wait for mp3 request
  logger.debug("Waiting for mp3 request...");
  let mediaUrl = await mp3Intercepted;
  mediaUrl = mediaUrl.split("?")[0];

  // Wait for the page to load
  // await page.waitForNetworkIdle();

  // await page.close();

  // const pages = await browser.pages();
  // await Promise.all(pages.map((page) => page.close()));

  //browser.process().kill("SIGINT");

  logger.debug("Closing browser...");
  await browser.close();
  logger.debug("Browser closed");

  return mediaUrl;
}

// note: could skip some steps by using
// https://bff-service.rtbf.be/auvio/v1.21/widgets/18800?context%5BprogramId%5D=1451&context%5Byear%5D=2024
