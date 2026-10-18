import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const origin = "https://evidence-atlas.netlify.app";
const shareImage = "/social-card-home-light-v2.png";
const sitemap = await readFile("dist/sitemap.xml", "utf8");
const robots = await readFile("dist/robots.txt", "utf8");
assert.match(robots, /User-agent: \*/);
assert.match(robots, /Allow: \//);
assert(!/Disallow: \//.test(robots), "Public pages must be crawlable");
assert(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert.deepEqual(urls.sort(), [`${origin}/`, `${origin}/guide/`].sort());
for (const path of ["/", "/guide/"]) {
  const html = await readFile(`dist${path}index.html`, "utf8");
  assert(
    html.includes(`rel="canonical" href="${origin}${path}"`),
    `${path}: canonical URL`,
  );
  assert.match(html, /<title>[^<]*Knowledge Graph[^<]*<\/title>/i);
  assert.match(html, /name="description"/);
  assert.match(html, /name="author" content="Ronit Gandotra"/);
  assert.match(html, /Created by/);
  assert.match(html, /class="creator-name"[\s\S]*?>Ronit Gandotra<\/a/);
  for (const profile of [
    "https://github.com/RonitGandotra05",
    "https://www.linkedin.com/in/ronitgandotra",
  ]) {
    assert(html.includes(`href="${profile}"`), `${path}: visible profile link`);
  }
  assert.match(html, /name="robots" content="index, follow/);
  for (const attribute of ['property="og:image"', 'name="twitter:image"']) {
    const tag = [...html.matchAll(/<meta\b[^>]*>/g)]
      .map(([tag]) => tag)
      .find((tag) => tag.includes(attribute));
    assert.equal(
      tag?.match(/content="([^"]+)"/)?.[1],
      `${origin}${shareImage}`,
      `${path}: current share image in ${attribute}`,
    );
  }
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /<h1[ >]/);
  assert.match(html, /<a[^>]+href="(?:\/)?#workspace"/);
  const blocks = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ];
  assert(blocks.length, `${path}: structured data is present`);
  for (const [, json] of blocks) {
    const data = JSON.parse(json);
    assert.equal(data["@context"], "https://schema.org");
    const entities = data["@graph"] || [data];
    const person = entities.find((entity) => entity["@type"] === "Person");
    assert.equal(person?.name, "Ronit Gandotra");
    assert.equal(person["@id"], `${origin}/#creator`);
    assert.deepEqual(person.sameAs, [
      "https://github.com/RonitGandotra05",
      "https://www.linkedin.com/in/ronitgandotra",
    ]);
    for (const entity of entities.filter((item) => item !== person)) {
      assert.equal((entity.creator || entity.author)?.["@id"], person["@id"]);
    }
    assert(
      !/aggregateRating|reviewRating/.test(json),
      "Do not fabricate ratings",
    );
  }
}
const home = await readFile("dist/index.html", "utf8");
assert.match(home, /Turn research papers into interactive knowledge graphs/);
assert.match(home, /href="\/guide\/"/);
assert.match(home, /id="home-start"/);
const image = await readFile(`dist${shareImage}`);
assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
assert.equal(image.readUInt32BE(16), 1200, "Share image width");
assert.equal(image.readUInt32BE(20), 630, "Share image height");
console.log(
  "SEO checks passed: readable HTML, canonical pages, metadata, structured data, robots, sitemap and share image.",
);
