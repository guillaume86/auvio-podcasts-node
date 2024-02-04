export interface XMLFeed {
  rss: RSS;
  "?xml-stylesheet"?: {
    "@_type": "text/xsl";
    "@_href": string;
  };
}

export interface RSS {
  channel: Channel;
}

export interface Channel {
  title: string;
  link: Description;
  description: Description;
  language: string;
  copyright: string;
  lastBuildDate: string;
  pubDate: string;
  webMaster: string;
  generator: string;
  item: Item[];
}

export interface Description {
  __cdata: string;
}

export interface Item {
  title: Description;
  guid: GUID;
  description: Description;
  pubDate: string;
  enclosure: Enclosure;
  link: Description;
  author: string;
  "itunes:duration": string;
}

export interface Enclosure {
  "@_url": string;
  "@_length": string;
  "@_type": string;
}

export interface GUID {
  "#text": string;
  "@_isPermaLink": string;
}
