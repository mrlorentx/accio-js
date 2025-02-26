import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createHttpClient, HttpClient } from "../../../src/index.ts";

const httpClient = createHttpClient({});
httpClient.on("request:start", (url) => {
  console.log("<== Outgoing: ", url);
});

httpClient.on("request:end", (url, res, duration) => {
  console.log(`==> Incoming (${res.status}) after ${duration}: ${url}`);
});

type Variables = {
  httpClient: HttpClient;
};

const app = new Hono<{ Variables: Variables }>();

app.use("*", async (c, next) => {
  c.set("httpClient", httpClient);
  await next();
});

const getTodos = async (httpClient: HttpClient) => {
  const res = await httpClient.get(
    "https://jsonplaceholder.typicode.com/todos/1",
  );
  return res.json();
};

app.get("/", async (c) => {
  const httpClient = c.get("httpClient");
  const todos = await getTodos(httpClient);
  return c.json(todos);
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
