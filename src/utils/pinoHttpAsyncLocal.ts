import { AsyncLocalStorage } from "async_hooks";
import { RequestHandler } from "express";
import { HttpLogger, pinoHttp } from "pino-http";

function proxyAsyncLocal(httpLogger: HttpLogger) {
  const context = new AsyncLocalStorage<HttpLogger["logger"]>();
  const logger = httpLogger.logger;

  // proxify logger instance to use child logger from context if it exists
  const localLogger = new Proxy(logger, {
    get(target, property, receiver) {
      target = context.getStore() || target;
      return Reflect.get(target, property, receiver);
    },
  });

  // wrap the httpLogger middleware to run the context
  const loggerMiddleware: RequestHandler = (req, res, next) => {
    httpLogger(req, res);
    return context.run(req.log, next);
  };

  const httpLoggerWithContext = Object.assign(loggerMiddleware, {
    logger: localLogger,
  }) as HttpLogger;

  return httpLoggerWithContext;
}

const pinoHttpProxy = (...args: Parameters<typeof pinoHttp>) => {
  const httpLogger = pinoHttp(...args);
  return proxyAsyncLocal(httpLogger);
};

const typedPinoHttpProxy = pinoHttpProxy as typeof pinoHttp;

export { typedPinoHttpProxy as pinoHttp };
