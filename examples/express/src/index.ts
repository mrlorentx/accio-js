import { Express } from "express";
//@ts-expect-error esModuleInterop for express..
import express from "express";
import { createHttpClient, HttpClient } from "../../../src/index.ts";

const app: Express = express();

const httpClient = createHttpClient({});

httpClient.on("request:start", (url) => {
  console.log("<== Outgoing: ", url);
});

httpClient.on("request:end", (url, res, duration) => {
  console.log(`==> Incoming (${res.status}) after ${duration}: ${url}`);
});

const getTodos = async (httpClient: HttpClient) => {
  const res = await httpClient.get(
    "https://jsonplaceholder.typicode.com/todos/1",
  );
  const json = await res.json();
  return json;
};

app.use("*", (_, res, next) => {
  res.locals.httpClient = httpClient;
  next();
});

app.get("/", async (_, res) => {
  const todos = await getTodos(res.locals.httpClient);
  res.send(todos);
});

app.listen(3000, () => {
  console.log(`Listening for requests on http://localhost:3000`);
});
