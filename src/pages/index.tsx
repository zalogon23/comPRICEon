const ExcelJS = require('exceljs');
import { useState } from 'react';
import { toast } from 'react-toastify';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faUpload } from '@fortawesome/free-solid-svg-icons';


export default function Home() {
  const [excelFile, setExcelFile] = useState(null as any);
  const [allProductsData, setAllProductsData] = useState([] as any[]);
  const [selectedProducts, setSelectedProducts] = useState({} as Record<string, any>);
  const [searched, setSearched] = useState(false)


  const handleFileChange = (event: any) => {
    const file = event.target.files[0];
    setExcelFile(file);
  };

  const handleSearch = async () => {
    if (!excelFile) {
      alert('Please select an Excel file.');
      return;
    }
    setSearched(true)
    const groups = await getSearchTerms(excelFile)

    try {
      const pendingToast = toast.info(`Estimated waiting time: ${groups[0].duration} seconds`, { autoClose: groups[0].duration * 1000 });
      const list = [] as any[]
      for (const group of groups) {
        console.log("consulting: " + group.searchTerms);

        const response = await fetch(`/api/scrape`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ searchTerms: group.searchTerms }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log(data);
          list.push(...data);
        } else {
          console.error('Error fetching data from the server');
        }
      }
      setAllProductsData(list);
      if (pendingToast) {
        toast.dismiss(pendingToast)
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };


  const handleChooseButtonClick = (productName: string, priceInfo: any) => {
    const id = Object.keys(selectedProducts).length
    delete selectedProducts[`${productName}-${id}`];
    selectedProducts[`${productName}-${id}`] = priceInfo;
    allProductsData.shift()
    setSelectedProducts({ ...selectedProducts });
  };

  const handleFinalButtonClick = async () => {
    if (allProductsData.length === 0) {
      const selectedData = Object.values(selectedProducts);
      generateExcel(selectedData);
    } else {
      alert('Please choose one product from each row.');
    }
  };

  const generateExcel = async (data: any) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Selected Items');

    // Define the columns
    worksheet.columns = [
      { header: 'Product Name', key: 'title', width: 45 },
      { header: 'Price', key: 'price', width: 15 },
      { header: 'URL', key: 'url', width: 240 },
    ];

    // Add the data
    data.forEach((item: any) => {
      worksheet.addRow(item);
    });

    // Generate and download the Excel file
    const blob = await workbook.xlsx.writeBuffer();
    const url = window.URL.createObjectURL(new Blob([blob]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'selected_items.xlsx';
    a.click();
  };

  return (
    <div className="container">
      {
        !allProductsData.length && !Object.keys(selectedProducts).length
          ?
          <>
            {
              !excelFile
                ?
                <>
                  <label htmlFor="excelFileInput" className="file-upload-button">
                    <FontAwesomeIcon icon={faUpload} /> Upload File
                  </label>
                  <input
                    type="file"
                    id="excelFileInput"
                    accept=".xlsx"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </>
                :
                <button disabled={searched} id="search-button" onClick={handleSearch}>
                  <FontAwesomeIcon icon={faUpload} />
                  <span className='pl-2'>Send</span>
                </button>
            }
          </>
          :
          <>
            <div id="productContainer" className="container">
              {
                allProductsData[0]
                &&
                <div className="product-row" key={`${allProductsData[0].productName}`}>
                  <h2 className="product-title pb-8 font-bold text-xl">{allProductsData[0].productName}</h2>
                  <div className="product-cards">
                    {allProductsData[0].lowestPrices.sort((a: any, b: any) => a.price - b.price).map((priceInfo: any, id: number) => (
                      <div key={id} className={`card ${selectedProducts[`${allProductsData[0].productName}`] === priceInfo ? 'chosen' : ''}`}>
                        <img src={priceInfo.image} alt="Product Image" />
                        <div className="card-content">
                          <h2 className="card-title">{priceInfo.title}</h2>
                          <div className="flex items-center mb-2">
                            <p className="card-price">${priceInfo.price.toFixed(2)}</p>
                            <a className="card-link" href={priceInfo.url} target="_blank">
                              View Product
                            </a>
                          </div>
                          <button
                            className="choose-button w-full"
                            data-product={priceInfo.title}
                            onClick={() => handleChooseButtonClick(allProductsData[0].productName, priceInfo)}
                          >
                            Choose
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              }
            </div>
            {
              allProductsData.length !== 0
              &&
              <div className="counter">{allProductsData.length}</div>
            }
            {
              allProductsData.length === 0
              &&
              <button
                id="final-button"
                onClick={handleFinalButtonClick}
              >
                Download Excel
              </button>
            }
          </>
      }
    </div>
  );

  async function getSearchTerms(excelFile: any) {
    const reader = new FileReader();
    const workbook = new ExcelJS.Workbook();

    const arrayBuffer = await new Promise((resolve) => {
      reader.onload = (e) => resolve(e.target!.result);
      reader.readAsArrayBuffer(excelFile);
    });

    await workbook.xlsx.load(arrayBuffer);

    const sheet = workbook.getWorksheet(1); // Assuming the sheet you want to read is the first one
    const productNames = [] as string[];

    sheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
      if (rowNumber > 1) {
        const productName = row.getCell('A').value; // Assuming 'products' are in column B
        if (productName) {
          productNames.push(productName);
        }
      }
    });

    const groups = groupNames(productNames)

    const duration = Math.ceil(groups.length * 9)

    return groups.map(products => ({ searchTerms: products.join(','), duration }));
  }
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