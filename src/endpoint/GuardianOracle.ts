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

const provide = new ethers.JsonRpcProvider('https://rpc.conet.network')
const apiKey = masterSetup.CoinMarketCapAPIKey
const oracleSC_addr = '0x8A7FD0B01B9CAb2Ef1FdcEe4134e32D066895e0c'
const managerWallet = new ethers.Wallet(masterSetup.oracleManager, provide)
const oracleSC = new ethers.Contract(oracleSC_addr, GuardianOracle_ABI, managerWallet)
const client = new CoinMarketCap(apiKey)
///							1 Credits
///		ids BNB: 1839, Dai: 4943, ETH: 1027, USDC: 3408, USDT: 825
const testData = [ 'eth', 'usdt', 'usdc', 'dai', 'bnb' ]
const testData1 = [

  2521.798130399146,
  1.000081714873474,
  0.9999341810909045,
  0.9998955107583655,
  537.1435821764862
]

const linten = 1000 * 60 *10
const updateOracle = async (tokenNames: string[], price: number[]) => {
	const priceArray = price.map(n => ethers.parseEther(n.toString()))

	logger(inspect(tokenNames, false, 3, true))
	logger(inspect(price, false, 3, true))
	logger(inspect(priceArray, false, 3, true))
	try {
		const tx = await oracleSC.updatePrice(tokenNames, priceArray)
		const ts = await tx.wait()
		return ts
	} catch (ex) {
		logger(Colors.magenta(`updateOracle Error!`), ex)
		return false
	}
}

const getIDs = () => {
	return client.getIdMap({symbol: ['BNB', 'DAI', 'ETH', 'USDT', 'USDC']}).then((data: any) => {
		logger(inspect(data, false, 3, true))
	})
}


const process = async () => {

	return client.getQuotes({id: [1839, 4943, 1027, 825, 3408]}).then(async (data: any) => {
		const usdt: quote = data.data['825'].quote
		const eth: quote = data.data['1027'].quote
		const usdc: quote = data.data['3408'].quote
		const dai: quote = data.data['4943'].quote
		const bnb: quote = data.data['1839'].quote
		const tokenNames = ['eth', 'usdt', 'usdc', 'dai', 'bnb']
		
		const price = [eth.USD.price, usdt.USD.price, usdc.USD.price, dai.USD.price, bnb.USD.price]
		await updateOracle(tokenNames, price)
		setTimeout (() => {
			process()
		}, linten)
	})
}

process()