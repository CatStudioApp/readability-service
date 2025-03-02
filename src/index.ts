import { serve } from '@hono/node-server'
import { Hono } from 'hono'

import {Readability} from '@mozilla/readability';

import {
  JSDOM,
  VirtualConsole
} from 'jsdom';
import type { Email } from 'postal-mime';

const DEFAULT_EMAIL_URL_START = 'https://inbox.demo.com';

const parseReader = (reader: Readability): {
  title?: string | null;
  content?: string | null;
  textContent?: string | null;
  length?: number | null;
  excerpt?: string | null;
  byline?: string | null;
  dir?: string | null;
  siteName?: string | null;
  lang?: string | null;
  publishedTime?: string | null;
} | null => {
  try {
    return reader.parse()
  } catch (e) {
    console.error(e);
    return null
  }
}
function readability(url: string, html: string) {
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  const reader = new Readability(dom.window.document);
  const image = getImage(dom.window.document);
  return {
    ...parseReader(reader),
    image,
  };
}


const buildUrl = (baseUrl: string, messageId?: string) => {
  if (!messageId) {
    const randomUuid = crypto.randomUUID();
    return `${baseUrl}/messages/${randomUuid}`;
  }
  return `${baseUrl}/inbox/${messageId}`;
};

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

type MailWithoutAttachments = Omit<Email, 'attachments'>;


app.post('/api/v1/email/readability', async (c) => {
  // auth header is `Bearer <READABILITY_SERVICE_KEY>`
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error(`[Unauthorized]: ${authHeader} ${process.env.READABILITY_SERVICE_KEY}`);
    return c.json({error: 'Unauthorized'}, 401);
  }

  // X-Base-Url header
  const baseUrl = c.req.header('X-Base-Url');
  if (!baseUrl) {
    console.error("🚀 ~ app.post ~ baseUrl:", baseUrl)
    return c.json({error: 'X-Base-Url header is required'}, 400);
  }
  const readabilityServiceKey = authHeader.split(' ')[1];
  if (readabilityServiceKey !== process.env.READABILITY_SERVICE_KEY) {
    console.error(`[Unauthorized]: ${authHeader} ${process.env.READABILITY_SERVICE_KEY}`);
    return c.json({error: 'Unauthorized'}, 401);
  }
  const mail = await c.req.json() as MailWithoutAttachments;
  const readabilityResult = readability(buildUrl(mail.messageId), mail.html ?? '');
  return c.json(readabilityResult);
})

app.post('/api/v1/test_run', async (c) => {
  const {html} = await c.req.json() as {html: string};
  console.log("🚀 ~ app.get ~ html:", html)
  const readabilityResult = readability(buildUrl('123'), html);
  return c.json(readabilityResult);
})

const port = 3030
console.log(`Server is running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})


/// https://github.com/Seraphli/obsidian-link-embed/blob/dbd4414595bfc4f89c5c48c5f20ced91a3c0cddd/parser.ts#L128
// MIT
function getImage(doc: Document): string {
  let element = doc.querySelector('head meta[property="og:image"]') as HTMLMetaElement | null;
  if (element) {
    return element.content;
  }

  let selectors = [
    'div[itemtype$="://schema.org/Product"] noscript img',
    'div[itemtype$="://schema.org/Product"] img',
    '#main noscript img',
    '#main img',
    'main noscript img',
    'main img',
    '*[role="main"] img',
    'body noscript img',
    'body img',
  ]

  for (const selector of selectors) {
    let images = doc.querySelectorAll(selector)

    for (let index = 0; index < images.length; index++) {
      const element = images[index];
      if (!meetsCriteria(element)) {
        continue;
      }
      let attribute = element.getAttribute('src');
      // Get image from document and return the full URL
      if (attribute) {
        return (element as HTMLImageElement).src;
      }
    }
  }

  return '';
}

function meetsCriteria(element: Element): boolean {
  const style = element.getAttribute('style');

  //If inline - display:none
  if (style && /display:\s*none/.test(style)) {
    return false;
  }

  //hide images in navigation bar/header
  let contains_header = false;
  element.classList.forEach((val) => {
    if (val.toLowerCase().includes('header')) {
      contains_header = true;
    }
  })
  if (element.id.toLowerCase().includes('header') || contains_header) {
    return false;
  }

  //recurse until <html>
  if (element.parentElement != null) {
    return meetsCriteria(element.parentElement);
  }

  return true;
}