import CurrentRequest from "./currentRequest.js";
import RethinkPlugin from "./plugin.js";
import Env from "./env.js";
import { DNSParserWrap as DnsParser } from "@serverless-dns/dns-operation";

const env = new Env();
const debug = false;

if (typeof addEventListener !== "undefined") {
  addEventListener("fetch", (event) => {
    if (!env.isLoaded) {
      env.loadEnv();
    }
    let workerTimeout = env.get("workerTimeout");
    if (env.get("runTimeEnv") == "worker" && workerTimeout > 0) {
      let dnsParser = new DnsParser();
      let returnResponse = Promise.race([
        new Promise((resolve, _) => {
          let resp = handleRequest(event);
          resolve(resp);
        }),
        new Promise((resolve, _) => {
          let resp = new Response(dnsParser.Encode({
            type: "response",
            flags: 4098, //sets server fail response
          }));
          resp.headers.set("Content-Type", "application/dns-message");
          resp.headers.set("Access-Control-Allow-Origin", "*");
          resp.headers.set("Access-Control-Allow-Headers", "*");
          if (debug) console.log("Worker Time Out");
          setTimeout(() => {
            resolve(resp);
          }, workerTimeout);
        }),
      ]);
      return event.respondWith(returnResponse);
    } else {
      event.respondWith(handleRequest(event));
    }
  });
}

export function handleRequest(event) {
  return proxyRequest(event);
}

async function proxyRequest(event) {
  const currentRequest = new CurrentRequest();
  let res;
  try {
    if (event.request.method === "OPTIONS") {
      res = new Response(null, { "status": 204 });
      res.headers.set("Access-Control-Allow-Origin", "*");
      res.headers.set("Access-Control-Allow-Headers", "*");
      return res;
    }

    // For environments which don't use FetchEvent to handle request.
    if (!env.isLoaded) {
      env.loadEnv();
    }
    const plugin = new RethinkPlugin(event, env);
    await plugin.executePlugin(currentRequest);
    return currentRequest.httpResponse;
  } catch (e) {
    console.error(e.stack);
    res = new Response(JSON.stringify(e.stack));
    res.headers.set("Content-Type", "application/json");
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("Access-Control-Allow-Headers", "*");
    res.headers.append("Vary", "Origin");
    res.headers.delete("expect-ct");
    res.headers.delete("cf-ray");
    return res;
  }
}
