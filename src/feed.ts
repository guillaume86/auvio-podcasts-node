import slug from "slug";
import fs from "fs";
import { logger } from "./logger.js";
import { scrapeUrl } from "./scraper.js";
import type { Item, XMLFeed } from "./types/XmlFeed.js";
import { buildXML, parseXML } from "./xml.js";
import { BASE_URL, MEDIA_URLS_FILE, WEBMASTER } from "./config.js";

interface ResultPromise<T> extends Promise<T> {
  result?: T;
}

export class Podcast {
  readonly feedURL: string;
  public name: string = "";
  public slug: string = "";
  public link: string = "";
  public episodes: Item[] = [];

  private feed: XMLFeed | null = null;
  private initPromise: Promise<void>;
  private mediaURLs: Map<string, ResultPromise<string>> = new Map();

  constructor(feedURL: string) {
    this.feedURL = feedURL;
    this.initPromise = this.init();
  }

  private async init() {
    const res = await fetch(this.feedURL);
    const feedXML = await res.text();
    this.feed = parseXML<XMLFeed>(feedXML);
    this.name = this.feed.rss.channel.title;
    this.slug = slug(this.name);
    this.link = this.feed.rss.channel.link.__cdata;
    this.episodes = structuredClone(this.feed.rss.channel.item);
    this.fetchMediaURLs();
  }

  async waitInit() {
    await this.initPromise;
  }

  async refresh() {
    this.initPromise = this.init();
    await this.initPromise;
  }

  private async fetchMediaURLs() {
    for (const item of this.episodes.toReversed()) {
      const guid = item.guid["#text"];
      if (!this.mediaURLs.has(guid)) {
        // TODO: queue requests with a maxParallelSesssions and reuse browser in getMediaURL
        const promise = this.getMediaURL(guid) as ResultPromise<string>;

        promise.then((mediaURL) => {
          promise.result = mediaURL;
        }, (err) => {
          logger.error({ guid, err }, "Error fetching media URL");
          this.mediaURLs.delete(guid);
        });

        this.mediaURLs.set(guid, promise);
      }
    }

    await Promise.all(this.mediaURLs.values());
  }

  async getPatchedXML(waitTimeout = 0) {
    await this.refresh();

    await Promise.race(
      [
        this.fetchMediaURLs(),
        new Promise((resolve) => setTimeout(resolve, waitTimeout)),
      ],
    );

    const feed = structuredClone(this.feed!);
    logger.info(`Patching feed: ${this.name}`);

    feed.rss.channel.link.__cdata = `${BASE_URL}/${this.slug}`;
    feed.rss.channel.webMaster = WEBMASTER;
    feed.rss.channel.generator =
      "auvio-podcasts-node (https://github.com/guillaume86/auvio-podcasts-node)";

    const patchedItems: Item[] = [];

    for (const item of feed.rss.channel.item.toReversed()) {
      const guid = item.guid["#text"];

      // const intermediateMediaURL = `${BASE_URL}/${this.slug}/media/${
      //   encodeURIComponent(guid)
      // }.mp3`;

      // const mediaURL = this.tryGetMediaURL(guid) || intermediateMediaURL;

      const mediaURL = this.mediaURLs.get(guid)?.result;
      if (mediaURL) {
        item.enclosure["@_url"] = mediaURL;
        patchedItems.push(item);
      } else {
        logger.error(`Media URL not available for guid ${guid}`);
        feed.rss.channel.pubDate = item.pubDate;
        feed.rss.channel.lastBuildDate = item.pubDate;
        break;
      }
    }

    feed.rss.channel.item = patchedItems.toReversed();
    if (patchedItems.length > 0) {
      feed.rss.channel.pubDate = feed.rss.channel.item[0].pubDate;
      feed.rss.channel.lastBuildDate = new Date().toUTCString();
    } else {
      const defaultDate = new Date(0).toUTCString();
      feed.rss.channel.pubDate = defaultDate;
      feed.rss.channel.lastBuildDate = defaultDate;
    }

    const result = buildXML(feed);
    logger.info(`Patched feed: ${this.name}`);
    return result;
  }

  async getMediaURL(guid: string): Promise<string> {
    const storageFile = MEDIA_URLS_FILE;
    let storage: { [key: string]: string } = {};

    if (fs.existsSync(storageFile)) {
      const rawData = fs.readFileSync(storageFile, "utf-8");
      storage = JSON.parse(rawData);
    }

    if (storage[guid]) {
      return storage[guid];
    }

    const mediaURL = await this.scrapeMediaURL(guid, this.feed!);

    storage[guid] = mediaURL;
    try {
      fs.writeFileSync(storageFile, JSON.stringify(storage, null, 2));
    } catch (err) {
      logger.error(`Could not save media URL to file: ${err}`);
    }

    return mediaURL;
  }

  tryGetMediaURL(guid: string): string | null {
    const storageFile = MEDIA_URLS_FILE;
    let storage: { [key: string]: string } = {};

    if (fs.existsSync(storageFile)) {
      const rawData = fs.readFileSync(storageFile, "utf-8");
      storage = JSON.parse(rawData);
    }

    return storage[guid] || null;
  }

  async scrapeMediaURL(guid: string, feed: XMLFeed) {
    logger.info({ guid }, "Scraping media URL...");

    const auvioPodcastURL = feed.rss.channel.link.__cdata;
    const item = feed.rss.channel.item.find(
      (item) => item.guid["#text"] === guid,
    );

    if (!item) {
      throw new Error(`Could not find item with guid: ${guid}`);
    }

    const match = item.guid["#text"].match(
      /https:\/\/auvio\.rtbf\.be\/media\/podcast-(\d+)/,
    );
    if (!match) {
      throw new Error(`Could not extract mediaId from guid: ${guid}`);
    }

    const mediaId = match[1];

    const mediaURL = await scrapeUrl(
      auvioPodcastURL,
      mediaId,
      Date.parse(item.pubDate),
    );

    logger.info({ guid, mediaURL }, "Scraped media URL");

    return mediaURL;
  }
}

// export interface Feed {
//   name: string;
//   url: string;
//   slug: string;
//   items: FeedItem[];
//   data: XMLFeed;
//   xml: string;
//   originalXML: string;
// }

// export interface FeedItem {
//   title: string;
//   url: string;
//   date: string;
//   duration: string;
//   description: string;
//   guid: string;
//   enclosure: {
//     url: string;
//     length: string;
//     type: string;
//   };
// }

// export async function getFeed(feedURL: string): Promise<Feed> {
//   const response = await fetch(feedURL);
//   const xml = await response.text();
//   const data = parseXML(xml) as XMLFeed;

//   const newData = {
//     ...data,
//     ["?xml-stylesheet"]: undefined,
//   };

//   const newXML = buildXML(newData);

//   const feed: Feed = {
//     name: data.rss.channel.title,
//     url: data.rss.channel.link.__cdata,
//     slug: slug(data.rss.channel.title),
//     items: data.rss.channel.item.map((item) => ({
//       title: item.title.__cdata,
//       url: item.link.__cdata,
//       date: item.pubDate,
//       duration: item["itunes:duration"],
//       description: item.description.__cdata,
//       guid: item.guid["#text"],
//       enclosure: {
//         url: item.enclosure["@_url"],
//         length: item.enclosure["@_length"],
//         type: item.enclosure["@_type"],
//       },
//     })),
//     data,
//     originalXML: xml,
//     xml: newXML,
//   };

//   return feed;
// }
