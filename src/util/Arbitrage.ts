import {ethers} from 'ethers'
import Colors from 'colors/safe'
import { createJupiterApiClient, QuoteGetRequest } from '@jup-ag/api'
import { logger } from './util'
import { masterSetup} from './util'
import Https from 'node:https'
import {inspect} from 'node:util'
import ArbitrageABI from './ArbitrageABI.json'
import { Connect\
import Bs58 from 'bs58'
import {getMint} from "@solana/spl-token"


const solana_account_privatekeyArray = Bs58.decode(masterSetup.solanaA)
const solana_account_privatekey = Keypair.fromSecretKey(solana_account_privatekeyArray)

const SOLANA_CONNECTION = new Connection(
	"https://api.mainnet-beta.solana.com" // We only support mainnet.
)

const jupiterQuoteApi = createJupiterApiClient()
const mainnetRPC = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network')

const usdtAddr = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const solanaAddr = "So11111111111111111111111111111111111111112"
const usdcAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const spAddr = "Bzr4aEQEXrk7k8mbZffrQ9VzX6V3PAH4LvWKXkKppump"

const sp_sol_pairAddr = '9AGSjaHxuTm4sLHAyRvn1eb4UT6rvuBwkb3Y6wP26BPu'
const mainnet_Arbitrage = '0x008acdca7ca0ce3c19fcbbef777eb34468976b67'.toLowerCase()
const ArbitrageSC_readOnly = new ethers.Contract(mainnet_Arbitrage, ArbitrageABI, mainnetRPC)

const solanaDecimalPlaces = 9
const usdtDecimalPlaces = 6
const usdcDecimalPlaces = 6
const spDecimalPlaces = 6

const solWallet = masterSetup.solanaA

let start = true
let current1 = ""
let current2 = ""
let current3 = ""
let current4 = ""


const tokenDecimal = (tokenAddr: string) => {
	switch(tokenAddr) {
		case usdtAddr: {
			return usdtDecimalPlaces
		}
		case solanaAddr: {
			return solanaDecimalPlaces
		}
		case spAddr: {
			return spDecimalPlaces
		}
		case usdcAddr: {
			return usdcDecimalPlaces
		}
		default: {
			return 18
		}
	}
}


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

const sp_usdt = async (usdt: string) => {
	const usdtNumber = ethers.parseUnits(usdt, usdtDecimalPlaces).toString()
	const params: QuoteGetRequest = {
		inputMint: spAddr,
		outputMint: usdtAddr,
		amount: parseFloat(usdtNumber),
		slippageBps: 100
	}
	const quote = await jupiterQuoteApi.quoteGet(params)
	const price_sp = ethers.formatUnits(quote.outAmount, spDecimalPlaces)
	logger(Colors.blue(`USDT ${usdt}  swap SP = ${price_sp}`))
	return price_sp
}

const sol_usdt = async (sol: string) => {
	const usdtNumber = ethers.parseUnits(sol, solanaDecimalPlaces).toString()
	const params: QuoteGetRequest = {
		inputMint: solanaAddr,
		outputMint: usdtAddr,
		amount: parseFloat(usdtNumber),
		slippageBps: 50, // 1%
	}
	const quote = await jupiterQuoteApi.quoteGet(params)
	const price_usdt = ethers.formatUnits(quote.outAmount, usdtDecimalPlaces)
	return price_usdt
}

const usdt_sol = async (usdt: string) => {
	const usdtNumber = ethers.parseUnits(usdt, usdtDecimalPlaces).toString()
	const params: QuoteGetRequest = {
		inputMint: usdtAddr,
		outputMint: solanaAddr,
		amount: parseFloat(usdtNumber),
		slippageBps: 50, // 1%
	}
	const quote = await jupiterQuoteApi.quoteGet(params)
	const price_sp = ethers.formatUnits(quote.outAmount, solanaDecimalPlaces)
	return price_sp
}

const Interval = 60 * 1000 * 5



const buyProcess = async (amount: string, usdtRate: string) => {
	logger(Colors.magenta(`buyProcess amount = ${amount} usdtRate = ${usdtRate}`))
	const _balance = await SOLANA_CONNECTION.getBalance(solana_account_privatekey.publicKey)
	const balance = ethers.formatUnits(_balance, solanaDecimalPlaces)
	
	
	const usdRate = parseFloat(amount)/parseFloat(usdtRate)
	const balanceToUSDT = parseFloat(balance) * usdRate

	logger(Colors.magenta(`Balance = ${balance} ==> usdt ${balanceToUSDT.toFixed(2)} buy Amount USDT = [${amount}]`))

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

let process = false


const swapGetTokenQuote = async (from: string, to: string, fromEthAmount: string) => {
	const fromPublicKey = new PublicKey(from)
	const toPublicKey = new PublicKey(to)
	const fromMint = await getMint(SOLANA_CONNECTION, fromPublicKey)
	const toMint = await getMint(SOLANA_CONNECTION, toPublicKey)
	const amount = ethers.formatUnits(fromEthAmount, tokenDecimal(from))
	const params: QuoteGetRequest = {
		inputMint: from,
		outputMint: to,
		amount: parseFloat(amount),
		slippageBps: 100
	}
}
const trade = async (baseUsdtBuy: string) => {
	process = true
	
	const _balance1 = await SOLANA_CONNECTION.getBalance(solana_account_privatekey.publicKey)
	const balance = ethers.formatUnits(_balance1, solanaDecimalPlaces)
	const balance_usdt = await sol_usdt(balance)
	logger(Colors.magenta(`trade baseUsdtBuy = ${baseUsdtBuy} account balance ${balance} Sol ==> Usdt ${balance_usdt}`))

	if (parseFloat(balance_usdt) < 0.1) {
		process = false
		return
	}



	const buy_floor = current2
	const sol = await usdt_sol(baseUsdtBuy)
	const spFromSol = await sol_sp(sol)
	const spPrice = (parseFloat(baseUsdtBuy)/parseFloat(spFromSol)).toFixed(8)
	const buyMargin = parseFloat(buy_floor) - parseFloat(spPrice)
	
	const _nextBuyAmount = parseFloat(baseUsdtBuy) * 1.5
	const nextBuyAmount = _nextBuyAmount < parseFloat(balance_usdt) ? parseFloat(balance_usdt) : _nextBuyAmount
	process = false
	logger(Colors.grey(`trade baseUsdtBuy = ${baseUsdtBuy} ==> Sol ${sol} SP price = ${spFromSol} price new = ${spPrice} buy_floor = ${buy_floor} buyMargin ${buyMargin.toFixed(8)}`))
	if (buyMargin > 0) {
		if (baseUsdtBuy < nextBuyAmount.toFixed(2)) {
			return trade (nextBuyAmount.toFixed(2))
		}
		buyProcess(baseUsdtBuy, sol)
	}
	
}

const checkCNTPTransfer = (tR:  ethers.TransactionReceipt) => {
	for (let log of tR.logs) {
		const LogDescription = ArbitrageSC_readOnly.interface.parseLog(log)
		if (!LogDescription?.name) {
			continue
		}
		const logName = LogDescription.name.toLowerCase()
		if ( logName === 'start') {
			logger(Colors.magenta(`Event Start!`))
			start = true
			continue
		}
		if ( logName === 'stop') {
			logger(Colors.magenta(`Event stop!`))
			start = false
			continue
		}
		if ( logName === 'change') {
			logger(Colors.magenta(`Event change!`))
			logger(inspect(LogDescription.args, false, 3, true))
			current1 = ethers.formatEther(LogDescription.args[0].toString())
			current2 = ethers.formatEther(LogDescription.args[1].toString())
			current3 = ethers.formatEther(LogDescription.args[2].toString())
			current4 = ethers.formatEther(LogDescription.args[3].toString())
			continue
		}
	}
}



const getBlock = async (block: number) => {
	const blockTs = await mainnetRPC.getBlock(block)
	if (!blockTs?.transactions) {
		return logger(Colors.gray(`mainnet Block Listenning ${block} has none`))
	}
	logger(Colors.gray(`mainnet Block Listenning ${block} has process now!`))
	for (let tx of blockTs.transactions) {
		const event = await mainnetRPC.getTransactionReceipt(tx)
		if ( event?.to?.toLowerCase() === mainnet_Arbitrage) {
			checkCNTPTransfer(event)
		}
		

		
	}
}

const getStatus = async () => {
	try {
		const STATUS = await ArbitrageSC_readOnly.readStatus()
		logger(inspect(STATUS, false, 3, true))
		start = STATUS[0]
		current1 = ethers.formatEther(STATUS[1])
		current2 = ethers.formatEther(STATUS[2])
		current3 = ethers.formatEther(STATUS[3])
		current4 = ethers.formatEther(STATUS[4])

	} catch (ex:any) {
		logger(Colors.red(`getStatus Error!`), ex.message)
	}
}

let currentBlock = 0

const daemondStart = async () => {
	
	currentBlock = await mainnetRPC.getBlockNumber()
	await getStatus()
	trade(current1)
	logger(Colors.magenta(`CoNET DePIN passport airdrop daemon Start from block [${currentBlock}]`))
	mainnetRPC.on('block', async block => {
		if (block > currentBlock) {

			currentBlock = block
			if (!process && start) {
				getBlock(block)
				trade(current1)
			}
			
		}
		
	})
}

// daemondStart()

// getStatus()

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

