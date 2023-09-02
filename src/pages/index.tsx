const ExcelJS = require('exceljs');
import { useState } from 'react';
import { toast } from 'react-toastify';

export default function Home() {
  const [excelFile, setExcelFile] = useState(null as any);
  const [allProductsData, setAllProductsData] = useState([] as any[]);
  const [selectedProducts, setSelectedProducts] = useState({} as Record<string, any>);


  const handleFileChange = (event: any) => {
    const file = event.target.files[0];
    setExcelFile(file);
  };

  const handleSearch = async () => {
    if (!excelFile) {
      alert('Please select an Excel file.');
      return;
    }

    const groups = await getSearchTerms(excelFile)

    try {
      const pendingToast = toast(`Estimated waiting time: ${groups[0].duration} seconds`, { autoClose: groups[0].duration * 1000 });
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


  const handleChooseButtonClick = (id: number, productName: string, priceInfo: any) => {
    delete selectedProducts[`${productName}-${id}`];
    selectedProducts[`${productName}-${id}`] = priceInfo;

    setSelectedProducts({ ...selectedProducts });
  };

  const handleFinalButtonClick = async () => {
    if (Object.keys(selectedProducts).length === allProductsData.length) {
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
        !allProductsData.length
          ?
          <>
            <input
              type="file"
              id="excelFileInput"
              accept=".xlsx"
              onChange={handleFileChange}
            />
            <button id="searchButton" onClick={handleSearch}>
              Send
            </button>
          </>
          :
          <>
            <div id="productContainer" className="container">
              {allProductsData.map((productData, index) => (
                <div className="product-row" key={`${productData.productName}-${index}`}>
                  <h2 className="product-title">{productData.productName}</h2>
                  <div className="product-cards">
                    {productData.lowestPrices.sort((a: any, b: any) => a.price - b.price).map((priceInfo: any, id: number) => (
                      <div key={id} className={`card ${selectedProducts[`${productData.productName}-${index}`] === priceInfo ? 'chosen' : ''}`}>
                        <img src={priceInfo.image} alt="Product Image" />
                        <div className="card-content">
                          <h2 className="card-title">{priceInfo.title}</h2>
                          <p className="card-price">${priceInfo.price.toFixed(2)}</p>
                          <a className="card-link" href={priceInfo.url} target="_blank">
                            View Product
                          </a>
                          <button
                            className="choose-button"
                            data-product={priceInfo.title}
                            onClick={() => handleChooseButtonClick(index, productData.productName, priceInfo)}
                          >
                            Choose
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              id="final-button"
              onClick={handleFinalButtonClick}
              disabled={Object.keys(selectedProducts).length < allProductsData.length}
            >
              Download Excel
            </button>
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