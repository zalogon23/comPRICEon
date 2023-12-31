import type { NextApiRequest, NextApiResponse } from 'next'
import puppeteer from 'puppeteer-core';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'POST') {
      const { searchTerms } = req.body;

      const allProductsData = await scrapeData(searchTerms.split(',').map((name: string) => name.trim()));

      res.status(200).json(allProductsData);
    } else {
      res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
async function scrapeData(productNames: string[]) {
  const percentage = 50;
  const times = 2.4

  const allProductsData = await Promise.all(productNames.map(async (productName) => {
    const formattedProductName = productName.replace(/\s+/g, '-');
    const updatedUrl = `https://listado.mercadolibre.com.ar/${formattedProductName}_OrderId_PRICE_ITEM*CONDITION_2230284_NoIndex_True#applied_filter_id%3DITEM_CONDITION%26applied_filter_name%3DCondici%C3%B3n%26applied_filter_order%3D12%26applied_value_id%3D2230284%26applied_value_name%3DNuevo%26applied_value_order%3D1%26applied_value_results%3D80223%26is_custom%3Dfalse`;
    const browser = await puppeteer.connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSER_API_KEY}`,
    })

    try {
      const page = await browser.newPage();
      console.log("going to " + updatedUrl)
      await page.goto(updatedUrl);

      const prices = await page.evaluate(() => {
        const removeDots = (inputString: string) => {
          return inputString?.replace(/\./g, '');
        }

        const priceContainers = Array.from(document.querySelectorAll(".andes-card.ui-search-result.shops__cardStyles.ui-search-result--core"));
        const prices = priceContainers.map(p => {
          const titleTag = p.querySelector("h2.ui-search-item__title.shops__item-title")
          const integerTag = p.querySelector(".ui-search-price__second-line .andes-money-amount__fraction")?.textContent;

          if (!integerTag) {
            return {
              price: Infinity,
              url: "",
              title: titleTag?.textContent,
              image: ""
            };
          }

          const integer = +removeDots(integerTag);
          const fractionTag = p.querySelector(".ui-search-price__second-line .andes-money-amount__cents")?.textContent;
          let fraction = 0;
          if (fractionTag) {
            fraction = +removeDots(fractionTag) ?? 0;
          }
          const linkTag = p.querySelector("a") as HTMLAnchorElement;
          const result = {
            price: integer + (fraction / 100),
            url: linkTag.href,
            title: titleTag?.textContent,
            image: ""
          };
          return result;
        });
        return prices;
      });

      let averagePrice = calculateAverage(prices.map((p: any) => p.price));
      const cappedPrices = prices.filter((p: any) => p.price < averagePrice * times)
      averagePrice = calculateAverage(cappedPrices.map((p: any) => p.price));
      const filteredPrices = cappedPrices.filter((p: any) => isInRange(p.price, averagePrice, percentage));
      const sortedPrices = filteredPrices.sort((a: any, b: any) => a.price - b.price);
      const lowestPrices = sortedPrices.slice(0, 6);

      const imageFetchingPromises = lowestPrices.map(async (lowestPrice: any) => {
        const imagePage = await browser.newPage(); // Create a new page instance for image fetching
        try {
          await imagePage.goto(lowestPrice.url);

          const imageUrl = await imagePage.evaluate(() => {
            const imageTag = document.querySelector("img.ui-pdp-image.ui-pdp-gallery__figure__image") as HTMLImageElement;
            return imageTag.src;
          });

          lowestPrice.image = imageUrl;
        } catch (err) {
          console.error("Error fetching image:", err);
        } finally {
          await imagePage.close(); // Close the image page when done
        }
      });

      await Promise.all(imageFetchingPromises);

      return {
        productName,
        lowestPrices
      };
    } finally {
      await browser.close();
    }
  }));

  return allProductsData;
}


function calculateAverage(numbers: number[]) {
  if (numbers.length === 0) {
    return 0; // Avoid division by zero
  }

  const sum = numbers.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
  return sum / numbers.length;
}

function isInRange(price: number, averagePrice: number, percentage: number) {
  const lowerThreshold = averagePrice * (100 - percentage) / 100;
  return price >= lowerThreshold;
}