import http from "http";
// @ts-ignore
import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import testRouter from "./routers/test";
import {
  configureProblemDetails,
  problem404,
  problem500,
} from "./problem-details";
import logger, { addLogger, logHttp } from "./logger";
import { exceptionsCounter, httpMetricsMiddleware } from "./metrics";
import { ENV } from "./env";
import { requestID } from "@gfx687/express-request-id";
import { createTerminus, HealthCheck } from "@godaddy/terminus";
import { migrateOrPanic } from "./migrator";
import { db } from "./models/database";
import { sql } from "kysely";

const cleanup = async () => {
  await db.destroy();
};

const onHealthCheck: HealthCheck = async (_) => {
  // throws if cannot connect to database
  await sql`select 1`.execute(db);
  return Promise.resolve();
};

(async () => {
  await migrateOrPanic();

  const app = express();

  app.use(express.json());
  app.use(requestID());
  app.use(addLogger);
  app.use(logHttp);

  configureProblemDetails(app);

  app.use(httpMetricsMiddleware);

  app.use("/api/test", testRouter);

  app.use((req, res) => {
    res.sendProblem(problem404(`Path or resource '${req.url}' not found.`));
  });

  app.use((err: Error, req: Request, res: Response, _: NextFunction) => {
    if (req.log) {
      req.log.error(err);
    } else {
      logger.error(err);
    }

    exceptionsCounter.inc();
    res.sendProblem(problem500);
  });

  const server = http.createServer(app);

  createTerminus(server, {
    timeout: 10000,
    signals: ["SIGTERM", "SIGINT"],
    logger: (msg, err) => logger.error({ err, source: "terminus" }, msg),
    onSignal: cleanup,
    healthChecks: { "/health": onHealthCheck },
  });

  server.listen(ENV.PORT, () => {
    logger.info(`Started. Listening on port ${ENV.PORT}`);
  });
})();
