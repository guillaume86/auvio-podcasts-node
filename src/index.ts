import "dotenv/config";
import express from "express";
import { BASE_URL, podcastsURLs, PORT } from "./config.js";
import { Podcast } from "./feed.js";
import { httpLogger, logger } from "./logger.js";

const app = express();

app.use(httpLogger);

app.use(express.static("public"));

const feedsPromise = (async function () {
  const feedList = await Promise.all(
    podcastsURLs.map(async (podcastURL) => {
      const feed = new Podcast(podcastURL);
      await feed.waitInit();

      // if (process.env.NODE_ENV !== "production") {
      //   const guid = feed.episodes[0].guid["#text"];
      //   const mediaURL = await feed.scrapeMediaURL(guid);
      //   logger.info({ mediaURL }, "First media URL");
      // }

      return feed;
    }),
  );
  return feedList.reduce((map, feed) => {
    map[feed.slug || "default"] = feed;
    return map;
  }, {} as Record<string, Podcast>);
})();

app.get("/", async (req, res) => {
  const feeds = Object.values(await feedsPromise);
  res.contentType("text/html");
  res.send(`
    <h1>Podcast feeds</h1>
    <ul>
      ${
    feeds
      .map(
        (feed) => `<li><a href="/${feed.slug}">${feed.name}</a></li>`,
      )
      .join("\n")
  }
    </ul>
  `);
});

app.get("/:slug", async (req, res) => {
  const feeds = await feedsPromise;
  const feed = feeds[req.params.slug];

  if (!feed) {
    return res.status(404).send("Not found");
  }

  res.contentType("text/html");
  res.send(`
    <h1>${feed.name}</h1>
    <a href="${feed.link}">website</a>
    <a href="/${feed.slug}/feed.xml">feed</a>
  `);
});

app.get("/:slug/feed.xml", async (req, res) => {
  const feeds = await feedsPromise;
  const feed = feeds[req.params.slug];

  if (!feed) {
    return res.status(404).send("Not found");
  }

  const xml = await feed.getPatchedXML();
  res.contentType("application/xml");
  res.send(xml);
});

// app.get("/:slug/media/:guid.mp3", async (req, res) => {
//   const feeds = await feedsPromise;
//   const feed = feeds[req.params.slug];

//   if (!feed) {
//     return res.status(404).send("Not found");
//   }

//   const { guid } = req.params;
//   req.log.info({ guid }, "Fetching media");

//   const mediaURL = await feed.getMediaURL(guid);
//   if (!mediaURL) {
//     return res.status(404).send("Not found");
//   }

//   return res.redirect(mediaURL);
// });

app.listen(PORT, () => {
  logger.info({ baseUrl: BASE_URL }, `Server listening`);
});
