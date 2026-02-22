import express from "express";
import url from "url";
import { readFileSync } from "fs";

import { renderToString } from "@solidjs/web";
import App from "../shared/src/components/App";

const manifest = JSON.parse(
  readFileSync(new URL("../public/js/asset-manifest.json", import.meta.url), "utf-8")
);

const app = express();
const port = 3000;

app.use(express.static(url.fileURLToPath(new URL("../public", import.meta.url))));

app.get("*", (req, res) => {
  let html;
  try {
    html = renderToString(() => <App url={req.url} />, { manifest });
  } catch (err) {
    console.error(err);
  } finally {
    res.send(html);
  }
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
