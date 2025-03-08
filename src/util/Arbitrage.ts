import {ethers} from 'ethers'
import listeningABI from './ArbitrageABI.json'
import Colors from 'colors/safe'
import { createJupiterApiClient, QuoteGetRequest } from '@jup-ag/api'
import { logger } from './util'
import Https from 'node:https'
import Http from 'node:http'
import {inspect} from 'node:util'

const jupiterQuoteApi = createJupiterApiClient()
const mainnetRPC = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network')
const listeningSC_addr = '0x6C82cAA8c90aAe5bA40eFAfa0748fC8e0ab4E921'
const listeningSC_readonly = new ethers.Contract(listeningSC_addr, listeningABI, mainnetRPC)
const usdtAddr = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const solanaAddr = "So11111111111111111111111111111111111111112"
const usdcAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const spAddr = "Bzr4aEQEXrk7k8mbZffrQ9VzX6V3PAH4LvWKXkKppump"

const sp_sol_pairAddr = '9AGSjaHxuTm4sLHAyRvn1eb4UT6rvuBwkb3Y6wP26BPu'

const solanaDecimalPlaces = 9
const usdtDecimalPlaces = 6
const usdcDecimalPlaces = 6
const spDecimalPlaces = 6

const usdt_sp = async (usdt: string) => {
	const usdtNumber = ethers.parseUnits(usdt, usdtDecimalPlaces).toString()
	const params: QuoteGetRequest = {
		inputMint: usdtAddr,
		outputMint: spAddr,
		amount: parseFloat(usdtNumber),
		slippageBps: 100, // 1%
	}
	const quote = await jupiterQuoteApi.quoteGet(params)
	const price_sp = ethers.formatUnits(quote.outAmount, spDecimalPlaces)
	logger(Colors.blue(`USDT ${usdt}  swap SP = ${price_sp}`))
	return price_sp
}

const sol_sp = async (sol: string) => {
	const usdtNumber = ethers.parseUnits(sol, solanaDecimalPlaces).toString()
	const params: QuoteGetRequest = {
		inputMint: solanaAddr,
		outputMint: spAddr,
		amount: parseFloat(usdtNumber),
		slippageBps: 100, // 1%
	}
	const quote = await jupiterQuoteApi.quoteGet(params)
	const price_sp = ethers.formatUnits(quote.outAmount, spDecimalPlaces)
	logger(Colors.blue(`Solana ${sol}  swap SP = ${price_sp}`))
	return price_sp
}

const getAPIData = (hostname: string, path: string, method: string, obj: any, callback: (data: any) => void)=> {
	
	const option: Https.RequestOptions = {
		hostname: hostname,
		path,
		port: 443,
		method: method,
		protocol: 'https:',
		headers: {
			'Content-Type': 'application/json',
			'X-API-Key': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjBjMTIxMzMzLTRmNDQtNDcwZS1iMzgzLTA0YzA1Yzg4MDA4NyIsIm9yZ0lkIjoiNDM1MzU5IiwidXNlcklkIjoiNDQ3ODYzIiwidHlwZUlkIjoiYTY1NGU1ZDEtOTkwYS00MDdmLWE5MTItYzlkODJkNGYzZjFhIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NDE0MTU1NTEsImV4cCI6NDg5NzE3NTU1MX0.ABHQ65S2XssoSG8hYlJ3nEHcRO4RezDPRx5y2tIsP_4'
		}
	}
	
	const req = Https.request (option, res => {
		if (res.statusCode!=200) {
			logger(`getLocalhostData res != 200 ${res.statusCode} Error!`)
			
		}
		let data = ''
		res.on('data', _data => {
			data += _data.toString()
		})
		res.once('end', () => {
			try {
				const ret = JSON.parse(data)
				callback(ret)
			} catch (ex) {
				logger(`getLocalhostData JSON parse Error!`)
				logger(inspect(data))
				return callback(null)
			}

		})
		
		
	})

	req.once('error', (e) => {
		console.error(`postLocalhost to master on Error! ${e.message}`)
	})

	req.write(JSON.stringify(obj))
	req.end()
}






// const options = {
//   method: 'GET',
//   headers: {
//     accept: 'application/json',
//     'X-API-Key': 'YOUR_API_KEY'
//   },
// };

// fetch(`https://solana-gateway.moralis.io/token/mainnet/${spAddr}/swaps?order=DESC`, options)
//   .then(response => response.json())
//   .then(response => console.log(response))
//   .catch(err => console.error(err));

// getAPIData('solana-gateway.moralis.io', `/token/mainnet/${spAddr}/swaps?order=DESC`, 'GET', {}, (err) => {
// 	logger(err)
// })