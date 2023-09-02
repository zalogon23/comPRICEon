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

  const groups = groupNames(productNames)
  console.log("there will be " + groups.length + " groups of productNames")

  const totalList = []

  for (const groupedProductNames of groups) {
    console.log(groupedProductNames)
    const allProductsData = await Promise.all(groupedProductNames.map(async (productName) => {
      const formattedProductName = productName.replace(/\s+/g, '-');
      const updatedUrl = `https://listado.mercadolibre.com.ar/${formattedProductName}_OrderId_PRICE_ITEM*CONDITION_2230284_NoIndex_True#applied_filter_id%3DITEM_CONDITION%26applied_filter_name%3DCondici%C3%B3n%26applied_filter_order%3D12%26applied_value_id%3D2230284%26applied_value_name%3DNuevo%26applied_value_order%3D1%26applied_value_results%3D80223%26is_custom%3Dfalse`;
      const browser = await puppeteer.connect({
        browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSER_API_KEY}`,
      })

      try {
        const page = await browser.newPage();
        console.log("going to " + updatedUrl)
        await page.goto(updatedUrl);

        const prices = await page.evaluate((productName: string) => {
          const removeDots = (inputString: string) => {
            return inputString?.replace(/\./g, '');
          }

          const priceContainers = Array.from(document.querySelectorAll(".andes-card.ui-search-result.shops__cardStyles.ui-search-result--core"));
          const prices = priceContainers.map(p => {
            const integerTag = p.querySelector(".ui-search-price__second-line .andes-money-amount__fraction")?.textContent;

            if (!integerTag) {
              return {
                price: Infinity,
                url: "",
                title: productName,
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
              title: productName,
              image: ""
            };
            return result;
          });
          return prices;
        }, productName);

        const averagePrice = calculateAverage(prices.map((p: any) => p.price));
        const filteredPrices = prices.filter((p: any) => isInRange(p.price, averagePrice, percentage));
        const lowestPrices = filteredPrices.slice(0, 6);

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

    totalList.push(...allProductsData);
  }
  return totalList
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

function groupNames(array: string[]) {
  const chunkSize = 10
  const result = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.slice(i, i + chunkSize);
    result.push(chunk);
  }
  return result;
}