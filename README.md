> :warning: **This package is currently experimental and the API is both poorly documented and likely to change**

# Media Finder

Media Finder attempts to provide a consistent API to search for, and pull the metadata of, various types of media (images, video, gifs, etc) from a variety of sites and sources.

## Search

```js
import { createMediaFinderQuery } from "media-finder";

// Self-executing async function is used here simply to enable the use of await.
(async () => {
  // Search and return immediately the first page of results
  const response = await createMediaFinderQuery({
    request: {
      source: "GIPHY",
      queryType: "Search",
      searchText: "cheese",
    },
    queryOptions: {
      secrets: {
        apiKey: process.env.GIPHY_API_KEY,
      },
    },
  }).getNext();
  // Prints the number of results in the first page
  console.log(`Got ${response?.media.length} gifs`);
})();

(async () => {
  // Alternatively create a query object which can be modified and iterated over
  const mediaQuery = createMediaFinderQuery({
    request: {
      source: "GIPHY",
      queryType: "Search",
      searchText: "cake",
    },
    queryOptions: {
      fetchCountLimit: 3,
      secrets: {
        apiKey: process.env.GIPHY_API_KEY,
      },
    },
  });

  const media = [];

  for await (const response of mediaQuery) {
    media.push(...response.media);
  }

  console.log(`Got ${media.length} gifs in total`);
})();
```
