import { pinoHttp } from "./utils/pinoHttpAsyncLocal.js";

const httpLogger = pinoHttp({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  quietReqLogger: true,
  // redact: {
  //   paths: [
  //     'req.headers.authorization'
  //   ],
  //   remove: true,
  // },
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

export { httpLogger };

const logger = httpLogger.logger;

export { logger };
