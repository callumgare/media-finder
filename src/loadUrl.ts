import { CheerioDomSelection, DomSelection } from "./DomSelection.js";
import * as cheerio from "cheerio";
import { gotScraping, Options as GotOptions } from "got-scraping";
import {
  cacheResponse,
  getCachedResponse,
} from "./lib/networkRequestsCache.js";
import deepmerge from "deepmerge";
import { ActionContext } from "./ActionContext.js";

type LoadUrlOptionsPlaywright = {
  agent: "playwright";
  responseType?: "dom";
  headers?: Record<string, string>;
};

type LoadUrlOptionsGot = {
  agent?: "got";
  responseType?: "dom" | "text" | "json";
  headers?: Record<string, string>;
  method?: GotOptions["method"];
  body?: string;
  retryAdditional?: GotOptions["retry"];
};

type LoadUrlOptions = LoadUrlOptionsPlaywright | LoadUrlOptionsGot;

type LoadUrlResponseDom = {
  root: DomSelection;
  statusCode: number;
};
type LoadUrlResponseJson = {
  data: unknown;
  statusCode: number;
};
type LoadUrlResponseText = {
  data: unknown;
  statusCode: number;
};

type LoadUrlResponse =
  | LoadUrlResponseDom
  | LoadUrlResponseJson
  | LoadUrlResponseText;
export async function loadUrl(
  url: string,
  props: LoadUrlOptions & { responseType: "json" },
): Promise<LoadUrlResponseJson>;
export async function loadUrl(
  url: string,
  props?: LoadUrlOptions & { responseType: "dom" },
): Promise<LoadUrlResponseDom>;
export async function loadUrl(
  url: string,
  props: LoadUrlOptions & { responseType: "text" },
): Promise<LoadUrlResponseText>;

export async function loadUrl(
  this: ActionContext,
  url: string,
  options?: LoadUrlOptions,
): Promise<LoadUrlResponse> {
  if (!options) {
    options = {};
  }
  if (this.cacheNetworkRequests === "auto") {
    throw Error(
      `The "auto" value for the cacheNetworkRequests option is not yet supported. Sorry!`,
    );
  }
  if (!options.agent) {
    options.agent = "got";
  }

  if (options.agent === "got") {
    const requestOptions = {
      ...(options.method && { method: options.method }),
      ...(options.body && { body: options.body }),
      ...(options.headers && { headers: options.headers }),
    };

    const defaultGotOptions = new GotOptions();
    let retry = defaultGotOptions.retry;
    if (options.retryAdditional) {
      retry = deepmerge(retry, options.retryAdditional);
    }

    let cache;

    let res;

    const cacheableRequest = {
      url,
      method: requestOptions.method ?? "",
      headers: requestOptions.headers ?? {},
      body: requestOptions.body ?? "",
    };

    if (this.cacheNetworkRequests === "always") {
      res = await getCachedResponse(cacheableRequest);
    } else {
      this.cacheNetworkRequests satisfies "never" | undefined;
    }

    if (!res) {
      res = await gotScraping({
        url,
        ...requestOptions,
        responseType: "text",
        retry,
        cache,
        http2: false, // Seems to be necessary otherwise got will throw "Unknown HTTP2 promise event: destroy"
        // when caching.
      });
      if (!res.ok) {
        throw Error(
          `Got response status ${res.statusCode} (retry count: ${res.retryCount}) with body: ${res.body}`,
        );
      }
      await cacheResponse(cacheableRequest, res);
    }

    const { body, statusCode } = res;

    if (options.responseType === "dom" || !options.responseType) {
      return { root: new CheerioDomSelection(cheerio.load(body)), statusCode };
    } else if (options.responseType === "json") {
      return { data: JSON.parse(body), statusCode };
    } else if (options.responseType === "text") {
      return { data: body, statusCode };
    } else {
      options.responseType satisfies never;
      throw Error(`Unknown response type "${options.responseType}"`);
    }
  } else if (options.agent === "playwright") {
    throw Error("Playwright not supported yet");
  } else {
    options.agent satisfies never;
    throw Error(`Unknown agent "${options.agent}"`);
  }
}
