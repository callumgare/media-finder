import { ZodError, z } from "zod";

import MediaFinder from "./MediaFinder.js"
import { queryOptionsSchema, QueryOptions } from "@/src/schemas/queryOptions.js";
import { finderOptionsSchema } from "@/src/schemas/finderOptions.js";
import { genericRequestSchema, GenericRequest, GenericRequestInput } from "@/src/schemas/request.js"
import { GenericResponse } from "@/src/schemas/response.js"
import { requestHandlerSchema } from "@/src/schemas/requestHandler.js";
import { generateResponse } from "./generateResponse.js";
import { GenericSecrets } from "./schemas/secrets.js";
import { FriendlyZodError } from "./utils.js";


const propsSchema = z.object({
  request: genericRequestSchema,
  queryOptions: queryOptionsSchema.default({}),
  finderOptions: finderOptionsSchema.default({}),
}).strict()
export type MediaFinderQueryProps = z.input<typeof propsSchema>

export default class MediaFinderQuery extends MediaFinder {
  #request: GenericRequest;
  #queryOptions: QueryOptions;
  #iterator: AsyncIterator<GenericResponse>;

  constructor(props: MediaFinderQueryProps) {
    let parsedProps
    try {
      parsedProps = propsSchema.parse(props)
    } catch (err) {
      if (err instanceof ZodError) {
        const error = new FriendlyZodError(err, {message: "MediaFinder argument invalid", inputData: props})
        console.error(error.formattedErrorInfo)
        process.exit(1)
      }
      throw err
    }
    super(parsedProps.finderOptions)
    this.#request = parsedProps.request;
    this.#queryOptions = parsedProps.queryOptions
    this.#iterator = this.getIterator();
  }

  get request(): GenericRequest {
    return {...this.#request};
  }

  set request(request: GenericRequestInput) {
    this.changeRequest(request);
  }

  changeRequest(request: GenericRequestInput) {
    this.rewind();
    this.#request = genericRequestSchema.parse(request);
  }

  async getNext(): Promise<GenericResponse | null> {
    const next = await this.#iterator.next();
    if (next.done) {
      return null;
    }
    return next.value;
  }

  rewind(): void {
    this.#iterator = this.getIterator();
  }

  [Symbol.asyncIterator] = this.getIterator;

  async *getIterator(): AsyncIterator<GenericResponse> {
    const handler = this.getRequestHandler()
    const handlerRequestSchema = this.getRequestSchema()
    const handlerSecretsSchema = handler.secretsSchema

    try {
      handlerRequestSchema.parse(this.#request)
    } catch (err) {
      if (err instanceof ZodError) {
        const error = new FriendlyZodError(err, {message: "Request is invalid", inputData: this.#request})
        console.error(error.formattedErrorInfo)
        process.exit(1)
      }
      throw err
    }

    try {
      if (handlerSecretsSchema) {
        handlerSecretsSchema.parse(this.#queryOptions.secrets)
      }
    } catch (err) {
      if (err instanceof ZodError) {
        const error = new FriendlyZodError(err, {message: "Secrets are invalid", inputData: this.#queryOptions.secrets})
        console.error(error.formattedErrorInfo)
        process.exit(1)
      }
      throw err
    }

    let pageFetchedCount = 0;
    const maxPagesToFetch = this.#queryOptions.fetchCountLimit;
    while (pageFetchedCount < maxPagesToFetch) {
      pageFetchedCount++
      const parsedRequest = handler.requestSchema.parse(this.#request)
      const parsedSecrets: GenericSecrets = (
        handler.secretsSchema?.parse(this.#queryOptions.secrets) as GenericSecrets | undefined
      ) ?? {}
      const pageFetchLimitReached = handler.paginationType === "none" ? undefined : pageFetchedCount === maxPagesToFetch
      const response = await generateResponse(
        {
          requestHandler: handler,
          request: parsedRequest,
          secrets: parsedSecrets,
          pageFetchLimitReached,
          source: this.getSource(parsedRequest.source),
          proxyUrls: this.#queryOptions.proxyUrls,
          cachingProxyPort: this.#queryOptions.cachingProxyPort,
        }
      )
      if (handler.paginationType === "offset") {
        // if paginationType is "offset" then pageNumber must exist due to a check in validateResponse
        // in generateResponse.ts but hard to prove that to typescript so we just add an if statement here
        // to stop typescript complaining
        if (response.page && 'pageNumber' in response.page) {
          this.#request.pageNumber = response.page.pageNumber + 1
        }

      } else if (handler.paginationType === "cursor") {
        // Same situation as in earlier if statement
        if (response.page && 'nextCursor' in response.page) {
          this.#request.cursor = response.page.nextCursor
        }
      }

      yield response;

      if (handler.paginationType === "none") {
        break
      }

      if (response.page?.isLastPage) {
        break;
      }
    }
  }

  getRequestHandler() {
    return super.getRequestHandler(this.#request.source, this.#request.queryType)
  }

  getRequestSchema(): z.infer<typeof requestHandlerSchema.shape.requestSchema> {
    return super.getRequestSchema(this.#request.source, this.#request.queryType)
  }

  getResponseSchema(): z.infer<typeof requestHandlerSchema.shape.responseSchema> {
    return super.getResponseSchema(this.#request.source, this.#request.queryType)
  }
}
