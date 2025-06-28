import {inspect} from 'node:util'

const BitMart = require('@bitmartexchange/bitmart-node-sdk-api')
// const bitmartSpotAPI = new Bitmart.BitmartSpotAPI({
//     apiKey: 'ee9ea9dfc969295ffbe3ad52a595091a7d63d4cf',
//     apiSecret: '7daa5aace2c362fa4a141c6e0f4e9c792f3e8c1ac8a6fe89cb68f2e8ab965955',
//     apiMemo: 'sp',
// })



const axios = require('axios');

const getPriceFromBitmart = async (): Promise<string> => {
    try {
        const res = await axios.get('https://api-cloud.bitmart.com/spot/quotation/v3/tickers')

        const data: any[][] = res.data.data
        const kk: string = data.filter(n => /^SP_/i.test(n[0]))[0][1]
        return kk
        
    } catch (error) {
        return ''
    }
}



getPriceFromBitmart()