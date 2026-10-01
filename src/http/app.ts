import express, { Express, Router } from 'express';
import type { Container } from '#src/application/dependency-injection/container';
import type { Installer } from '#src/application/installer';
import { ErrorHandler } from '#src/http/error-handler';
import { NotFoundRoute } from '#src/http/not-found-route';
import { OpenApiRoute } from '#src/http/openapi-route';

export class App {
  public static provide(container: Container): App {
    return new App(container);
  }

  public readonly http: Express;
  public readonly routes: Router = express.Router();

  constructor(public readonly container: Container) {
    this.http = express();
    this.http.use(express.json({ limit: '16kb' }));
    this.http.get('/openapi.json', new OpenApiRoute().handle);
    this.http.use(this.routes);
    this.http.use(new NotFoundRoute().handle);
    this.http.use(new ErrorHandler().handle);
  }

  public install(feature: Installer<App>): App {
    return feature(this);
  }

  public listen(port = 3000, host = '0.0.0.0') {
    return this.http.listen(port, host);
  }
}
