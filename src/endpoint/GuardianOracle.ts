import { masterSetup} from '../util/util'
import {ethers} from 'ethers'
import { logger } from '../util/logger'
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import GuardianOracle_ABI from './GuardianOracleABI.json'
const CoinMarketCap = require('coinmarketcap-api')
interface quote {
	USD: {
		price: number
		volume_24h: number
		volume_change_24h: number
		percent_change_1h: number
		percent_change_24h: number
		percent_change_7d: number
		percent_change_30d: number
		percent_change_60d: number
		percent_change_90d: number
		market_cap: number
		market_cap_dominance: number
		fully_diluted_market_cap: number
		tvl: null
		last_updated: string
	}
}

const provide = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network')
const apiKey = masterSetup.CoinMarketCapAPIKey
const oracleSC_addr = '0xE9922F900Eef37635aF06e87708545ffD9C3aa99'
const managerWallet = new ethers.Wallet(masterSetup.oracleManager, provide)
const oracleSC = new ethers.Contract(oracleSC_addr, GuardianOracle_ABI, managerWallet)
const client = new CoinMarketCap(apiKey)
///							1 Credits
///		ids BNB: 1839, Dai: 4943, ETH: 1027, USDC: 3408, USDT: 825 TRX:1958
const testData = [ 'eth', 'usdt', 'usdc', 'dai', 'bnb'  ]
const testData1 = [

  2521.798130399146,
  1.000081714873474,
  0.9999341810909045,
  0.9998955107583655,
  537.1435821764862
]

const linten = 1000 * 60 * 10
const updateOracle = async (tokenNames: string[], price: number[]) => {
	const priceArray = price.map(n => ethers.parseEther(n.toString()))

	logger(inspect(tokenNames, false, 3, true))
	logger(inspect(price, false, 3, true))
	logger(inspect(priceArray, false, 3, true))
	try {
		const tx = await oracleSC.updatePrice(tokenNames, priceArray)
		logger(`Write to Smart Contract success! ${tx.hash}`)
		const ts = await tx.wait()
		
		return ts
	} catch (ex) {
		logger(Colors.magenta(`updateOracle Error!`), ex)
		return false
	}
}

const getIDs = () => {
	return client.getIdMap({symbol: ['BNB', 'DAI', 'ETH', 'USDT', 'USDC', 'TRX']}).then((data: any) => {
		logger(inspect(data, false, 3, true))
	})
}

const getUsdFxFromCoinbase = async () => {
    const res = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD')
    if (!res.ok) throw new Error(`coinbase fx failed: ${res.status}`)
    const json: any = await res.json()

    const rates = json?.data?.rates || {}
    const cad = Number(rates.CAD)
    const jpy = Number(rates.JPY)
    const cny = Number(rates.CNY) // 人民币 ISO= CNY

    if (!cad || !jpy || !cny) throw new Error('missing CAD/JPY/CNY in coinbase rates')
    return { USDCAD: cad, USDJPY: jpy, USDCNY: cny }
}


const process = async () => {
    try {
        const [cmc, fx] = await Promise.all([
        client.getQuotes({ id: [1839, 4943, 1027, 825, 3408, 1958] }),
        getUsdFxFromCoinbase()
        ])

        const usdt = cmc.data['825'].quote
        const eth = cmc.data['1027'].quote
        const usdc = cmc.data['3408'].quote
        const dai = cmc.data['4943'].quote
        const bnb = cmc.data['1839'].quote
        const tron = cmc.data['1958'].quote

        const tokenNames = ['eth', 'usdt', 'usdc', 'dai', 'bnb', 'trx', 'usd-cad', 'usd-jpy', 'usd-cny']
        const price = [
            eth.USD.price,
            usdt.USD.price,
            usdc.USD.price,
            dai.USD.price,
            bnb.USD.price,
            tron.USD.price,
            fx.USDCAD,
            fx.USDJPY,
            fx.USDCNY
        ]

        await updateOracle(tokenNames, price)
    } finally {
        setTimeout(() => process(), linten)
    }
}
// getIDs()
process()

logger(managerWallet.address)
