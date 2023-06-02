import Cheerio from "cheerio";
import fetch from "node-fetch";
import mimeTypes from "mime-types";
import { z } from "zod";
export { z };
import { fromZodError } from 'zod-validation-error';

export async function getWebpage(url) {
  return getWebpageWithFetch(url);
}

export function createFileFromURL(
  url: string,
  kind: string,
  additionalValues?: any
) {
  let ext = additionalValues?.ext || url.match(/\.(\w+)(?:\?[^?]*)?$/)?.[1];
  let mimeType = additionalValues?.mimeType;
  if (ext && !mimeType) {
    mimeType = mimeTypes.lookup(ext);
  } else if (mimeType && !ext) {
    ext = mimeTypes.extension(mimeType);
  }
  if (!ext || !mimeType) {
    console.info(`url: ${url}\next: ${ext}\nmimeType: ${mimeType}`);
    throw new Error("Couldn't derive file type");
  }
  let video, image;
  if (
    mimeType.match(/^video\//) ||
    ext.match(/^gif$/i) ||
    mimeType === "application/vnd.apple.mpegurl"
  ) {
    video = true;
    image = false;
  } else if (mimeType.match(/^image\//)) {
    video = false;
    image = true;
  } else {
    throw new Error(`Media type not valid: ${mimeType}`);
  }
  return {
    type: "file",
    url,
    ext,
    mimeType,
    kind,
    video,
    image,
    ...additionalValues,
  };
}

async function getWebpageWithFetch(url) {
  try {
    const body = await fetch(url).then((res) => res.text());
    return Cheerio.load(body);
  } catch (error) {
    console.error("Failed when trying to load: " + url);
    throw error;
  }
}

export function validateSchema<Schema extends z.AnyZodObject>(
  schema: Schema,
  objectToValidate: unknown
): z.infer<Schema> {
  try {
    return schema.parse(objectToValidate);
  } catch (error: typeof z.ZodError | unknown) {
    if (error instanceof z.ZodError) {
      console.error(
        `${error.issues.length} issue(s) occurred when trying to parse the response`
      );
      console.error(fromZodError(error))
      return objectToValidate as z.infer<Schema>;
    } else {
      throw error;
    }
  }
}
