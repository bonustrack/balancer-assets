const fs = require('fs');
const { ethers, utils, getDefaultProvider } = require('ethers');
const fetch = require('node-fetch');
const trustwallet = require('./trustwallet.json');
const abi = require('./abi');

const id = '1lD6dd-GbuHeX9mwA75ny9oCdzwE9tLJORub8WvX0D-g';
const multicallAddress = '0xeefBa1e63905eF1D7ACbA5a8513c70307C1cE441';
const privateKey = '0x0123456789012345678901234567890123456789012345678901234567890123';

const url = `https://spreadsheets.google.com/feeds/cells/${id}/1/public/full?alt=json`;
const columnsNames = {};

const hasImage = (address) => trustwallet.includes(utils.getAddress(address));

const getSpreadsheet = async () => {
  const spreadsheet = {};
  await fetch(url)
    .then(res => res.json())
    .then(json => {
      json.feed.entry.forEach(entry => {
        const { col, row, inputValue } = entry['gs$cell'];
        if (row === '1') {
          columnsNames[col] = inputValue.toLowerCase();
        } else {
          let updatedRow = spreadsheet[row] || {};
          updatedRow[columnsNames[col]] = inputValue;
          spreadsheet[row] = updatedRow;
        }
      });
    });
  return spreadsheet;
}

const getAssetsMetadata = async (assets) => {
  const provider = getDefaultProvider();
  const wallet = new ethers.Wallet(privateKey, provider);

  const multi = new ethers.Contract(
    multicallAddress,
    abi['Multicall'],
    wallet
  );

  const callsName = [];
  const callsSymbol = [];
  const callsDecimals = [];
  const testToken = new utils.Interface(abi['TestToken']);
  assets.forEach(asset => {
    callsName.push([asset, testToken.functions.name.encode([])]);
    callsSymbol.push([asset, testToken.functions.symbol.encode([])]);
    callsDecimals.push([asset, testToken.functions.decimals.encode([])]);
  });
  try {
    console.log('Loading');
    const [, resNames] = await multi.aggregate(callsName);
    const [, resSymbols] = await multi.aggregate(callsSymbol);
    const [, resDecimals] = await multi.aggregate(callsDecimals);
    const names = resNames.map(item => testToken.functions.symbol.decode(item));
    const symbols = resSymbols.map(item => testToken.functions.symbol.decode(item));
    const decimals = resDecimals.map(item => testToken.functions.decimals.decode(item));
    return Object.fromEntries(assets.map((asset, i) => [asset, {
      address: asset,
      name: names[i][0],
      symbol: symbols[i][0],
      decimals: decimals[i][0],
      hasImage: hasImage(asset)
    }]))
  } catch (e) {
    console.error(e);
    return Promise.reject();
  }
}

const generate = async () => {
  const sheet = await getSpreadsheet();

  const dexWhitelist = Object.entries(sheet)
    .filter(asset => asset[1].address && asset[1].dex === 'Added')
    .map(asset => asset[1].address.toLowerCase().trim());
  console.log('DEX whitelist', dexWhitelist);

  const dexBlacklist = Object.entries(sheet)
    .filter(asset => asset[1].address && asset[1].dex === 'Denied')
    .map(asset => asset[1].address.toLowerCase().trim());
  console.log('DEX blacklist', dexBlacklist);

  const assetsMetadata = await getAssetsMetadata(dexWhitelist);
  console.log(assetsMetadata);
  fs.writeFileSync('./generated/whitelist.json', JSON.stringify(assetsMetadata, null, 2));
  fs.writeFileSync('./generated/bal/config.json', JSON.stringify(assetsMetadata, null, 2));
  fs.writeFileSync('./generated/dex/config.json', JSON.stringify(assetsMetadata, null, 2));
  fs.writeFileSync('./generated/pm/config.json', JSON.stringify(assetsMetadata, null, 2));
}

generate();
