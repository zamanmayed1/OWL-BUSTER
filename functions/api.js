const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const url = require("url");
const validator = require("email-validator");

const app = express();
app.use(express.json());
app.use(cors());

// Dynamic import of p-limit
let pLimit;
(async () => {
  pLimit = (await import("p-limit")).default;
})();

// Helper function to extract and validate emails using regex
const extractValidEmails = (text) => {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = text.match(emailRegex) || [];

  const isBusinessEmail = (email) => {
    const exampleDomains = ["example.com", "test.com", "fake.com"];
    const emailDomain = email.split("@")[1];
    return (
      !exampleDomains.includes(emailDomain) &&
      !emailDomain.match(/\.(png|jpeg|jpg|gif|webp)$/)
    );
  };

  return emails
    .filter((email) => validator.validate(email) && isBusinessEmail(email))
    .slice(0, 3); // Limit to 3 emails
};

// Function to fetch the HTML content of a webpage with caching
const fetchHTML = (() => {
  const cache = new Map();

  return async (siteUrl) => {
    if (cache.has(siteUrl)) {
      return cache.get(siteUrl);
    }

    try {
      const { data } = await axios.get(siteUrl);
      cache.set(siteUrl, data);
      return data;
    } catch {
      return null;
    }
  };
})();

// Function to crawl and extract emails from a website
const crawlWebsiteForEmails = async (siteUrl) => {
  if (!pLimit) {
    throw new Error("p-limit module not loaded yet");
  }

  const parsedUrl = url.parse(siteUrl);
  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
  const emails = new Set();

  const contactPaths = [
    "/contact",
    "/contact-us",
    "/contact-us.html",
    "/contact-us.php",
    "/contact-us.aspx",
    "/contact.html",
    "/contact.php",
    "/contact.aspx",
    "/en/contact-us",
    "/en/contact",
    "/fr/contact",
    "/es/contacto",
    "/de/kontakt",
    "/contact-us-de",
    "/support/contact-us",
    "/get-in-touch",
    "/reach-out",
    "/contact-info",
    "/contact-information",
    "/contact_us",
    "/Contact",
    "/CONTACT-US",
    "/Contact-Us",
  ];

  const homepageHtml = await fetchHTML(baseUrl);
  if (homepageHtml) {
    const $ = cheerio.load(homepageHtml);
    const homepageEmails = extractValidEmails($.html());
    homepageEmails.forEach((email) => emails.add(email));

    const headerEmails = extractValidEmails($("header").html() || "");
    headerEmails.forEach((email) => emails.add(email));

    const footerEmails = extractValidEmails($("footer").html() || "");
    footerEmails.forEach((email) => emails.add(email));
  }

  const limit = pLimit(10);
  const contactPagePromises = contactPaths.map((path) =>
    limit(async () => {
      const contactPageUrl = url.resolve(baseUrl, path);
      const contactPageHtml = await fetchHTML(contactPageUrl);
      if (contactPageHtml) {
        const contactPageEmails = extractValidEmails(contactPageHtml);
        contactPageEmails.forEach((email) => emails.add(email));
      }
    })
  );

  await Promise.all(contactPagePromises);

  return Array.from(emails);
};

// API endpoint to crawl websites and return emails
app.post("/crawl", async (req, res) => {
  const { websites } = req.body;
  const results = {};
  let websitesInputted = websites.length;
  let websitesCrawled = 0;
  let emailsFound = 0;

  // Crawl all websites concurrently
  const crawlPromises = websites.map(async (siteUrl) => {
    websitesCrawled++;
    try {
      console.log(`Crawling ${siteUrl}...`);
      const emails = await crawlWebsiteForEmails(siteUrl);
      results[siteUrl] = emails.slice(0, 3); // Limit to 3 emails
      emailsFound += results[siteUrl].length;
    } catch (error) {
      console.error(`Failed to crawl ${siteUrl}: ${error.message}`);
      results[siteUrl] = [];
    }
  });

  await Promise.all(crawlPromises);

  res.json({
    websitesInputted,
    websitesCrawled,
    emailsFound,
    results,
  });
});

app.get("/", async (req, res) => {
  res.send("OWL BUSTER is Running by the Name of Allah");
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.use("/.netlify/functions/api", app);
module.exports.handler = serverless(app);
