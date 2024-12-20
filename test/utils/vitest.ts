import { Source } from "@/src/schemas/source.js";
import { expect, test, inject } from "vitest";
import { GenericResponse, createMediaFinderQuery } from "@/src/index.js";
import { FinderOptionsInput } from "@/src/schemas/finderOptions.js";
import { getOrdinal, hasNoDuplicates } from "@/src/lib/utils.js";
import { QueryOptionsInput } from "@/src/schemas/queryOptions.js";
import cachingNetworkPlugin, {
  setCachingProxyPort,
} from "@/src/plugins/cache-network.js";
import deepmerge from "deepmerge";
import { copy } from "copy-anything";
import { getSecrets } from "./general.js";

export function createBasicTestsForRequestHandlers<
  S extends Source,
  HandlerIds extends S["requestHandlers"][number]["id"],
  Query extends {
    request?: Record<string, any>;
    secrets?: Record<string, any>;
    checkResponse?: (
      response: any,
      other: { pageLoadNum: number; message: string },
    ) => void | number;
    numOfPagesToLoad?: number;
    numOfPagesToExpect?: number;
    queryOptions?: QueryOptionsInput;
    finderOptions?: FinderOptionsInput;
    duplicateMediaPossible?: boolean;
    timeout?: number;
  },
  Queries extends { [Key in HandlerIds]: Query | Query[] },
  QueriesShared extends Query,
>(options: { source: S; queries: Queries; queriesShared?: QueriesShared }) {
  const { source, queries, queriesShared } = options;
  for (const requestHandler of source.requestHandlers) {
    if (!(requestHandler.id in queries)) {
      throw Error(`No query provided for request handler ${requestHandler.id}`);
    }
    const handlerQueries = [queries[requestHandler.id as HandlerIds]].flat(1);
    for (const query of handlerQueries) {
      const request = {
        source: source.id,
        queryType: requestHandler.id,
        ...query?.request,
        ...queriesShared?.request,
      };

      const timeout = query.timeout ?? queriesShared?.timeout;
      const formattedQuery = JSON.stringify(request, null, 2).replace(
        /\n\s*/g,
        " ",
      );

      test(
        `Query: ${formattedQuery}`,
        async () => {
          const numOfPagesToLoad = query.numOfPagesToLoad ?? 1;
          const numOfPagesToExpect =
            query.numOfPagesToExpect ?? numOfPagesToLoad;
          const isPlainObject = (value: any) =>
            value?.constructor === Object || Array.isArray(value);
          const deepMergeOptions = {
            isMergeableObject: isPlainObject,
          };
          setCachingProxyPort(inject("cachingProxyPort"));
          const mediaQuery = await createMediaFinderQuery({
            request,
            queryOptions: deepmerge.all(
              [
                queriesShared?.queryOptions || {},
                query?.queryOptions || {},
                {
                  secrets: {
                    ...(await getSecrets(request)),
                    ...queriesShared?.secrets,
                    ...query?.secrets,
                  },
                },
              ],
              deepMergeOptions,
            ),
            finderOptions: deepmerge.all(
              [
                queriesShared?.finderOptions || {},
                query?.finderOptions || {},
                {
                  plugins: [cachingNetworkPlugin],
                },
              ],
              deepMergeOptions,
            ),
          });

          const responses: any[] = [];
          let customResponseTestExpectedAssertions = 0;

          for (let i = 0; i < numOfPagesToLoad; i++) {
            const response = await mediaQuery.getNext();
            responses.push(response);

            if (i + 1 < numOfPagesToExpect) {
              // If we're expecting more pages then isLastPage should not be "true"
              expect(
                response?.page?.isLastPage,
                `Expected to receive another response after ${getOrdinal(
                  i + 1,
                )} but page.isLastPage is set to "true"`,
              ).not.toBe(true);
            } else if (numOfPagesToExpect < numOfPagesToLoad) {
              // If this is the last expected page of content but we've explicitly requested to load more pages after this
              // assume that this is the last page and thus isLastPage should not be "false"
              expect(
                response?.page?.isLastPage,
                `Expected to not receive another response after ${getOrdinal(
                  i + 1,
                )} but page.isLastPage is set to "false"`,
              ).not.toBe(false);
            } else {
              // It's easy to calculate the number of expected assertions if we include this dummy assertion
              expect(true).toBe(true);
            }

            if (i < numOfPagesToExpect) {
              expect(
                response,
                `Expected a response for the ${getOrdinal(
                  i + 1,
                )} request but response was null`,
              ).not.toBe(null);
            } else {
              expect(
                response,
                `Expected null as the response for the ${getOrdinal(
                  i + 1,
                )} request`,
              ).toBe(null);
            }

            const customResponseChecks = [
              ...(query?.checkResponse ? [query?.checkResponse] : []),
              ...(queriesShared?.checkResponse
                ? [queriesShared?.checkResponse]
                : []),
            ];
            for (const checkResponse of customResponseChecks) {
              const result = checkResponse(response, {
                message: `The response for the ${getOrdinal(
                  i + 1,
                )} request was not what was expected`,
                pageLoadNum: i,
              });
              customResponseTestExpectedAssertions +=
                typeof result === "number" ? result : 1;
            }
          }

          if (!query.duplicateMediaPossible) {
            const idsOfMedia = responses
              .map((response: GenericResponse | null) => response?.media || [])
              .flat()
              .filter((media) => media)
              .map((media: any) => media.id);

            expect(idsOfMedia).toSatisfy(
              hasNoDuplicates,
              "Media with the same ID appears in multiple responses",
            );
          }

          expect.assertions(
            numOfPagesToLoad * 2 +
              (query.duplicateMediaPossible ? 0 : 1) +
              customResponseTestExpectedAssertions,
          );
        },
        timeout,
      );
    }
  }
}

// Some values in a response may naturally change over time
// or be differ based on other factors like a client's ip.
// This can result in the tests failing due to a response
// not matching its snapshot even though this difference may
// not indicate any problem. To avoid this we first normalise
// any parts of a response which may naturally vary before we
// snapshot it.
export function normaliseResponse(response: GenericResponse) {
  const clonedResponse = copy(response);
  for (const media of clonedResponse.media || []) {
    if (media.url) {
      const url = new URL(media.url);
      media.url = url.origin + url.pathname;
    }

    for (const file of media?.files || []) {
      if (file.url) {
        const url = new URL(file.url);
        file.url = url.origin + url.pathname;
      }
    }
  }
  return clonedResponse;
}
