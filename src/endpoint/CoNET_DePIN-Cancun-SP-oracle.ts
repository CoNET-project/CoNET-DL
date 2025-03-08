import {  Connection} from "@solana/web3.js"

import {ethers} from "ethers"
import {inspect} from 'node:util'
import {logger, masterSetup} from '../util/util'
import Colors from 'colors/safe'
import { createJupiterApiClient, QuoteGetRequest } from '@jup-ag/api'
import SP_Oracle_ABI from './SP_OracleABI.json'

const CoNET_CancunRPC = 'https://cancun-rpc.conet.network'
const endPointCancun = new ethers.JsonRpcProvider(CoNET_CancunRPC)
const SP_Oracle_Addr = '0xA57Dc01fF9a340210E5ba6CF01b4EE6De8e50719'
const SP_Oracle_Wallet = new ethers.Wallet(masterSetup.SP_Oracle, endPointCancun)
const SP_Oracle_SC = new ethers.Contract(SP_Oracle_Addr, SP_Oracle_ABI, SP_Oracle_Wallet)
logger(SP_Oracle_Wallet.address)
const solanaDecimalPlaces = 9
const usdtDecimalPlaces = 6
const usdcDecimalPlaces = 6
const spDecimalPlaces = 6

const usdtAddr = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const solanaAddr = "So11111111111111111111111111111111111111112"
const usdcAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const spAddr = "Bzr4aEQEXrk7k8mbZffrQ9VzX6V3PAH4LvWKXkKppump"

const SC_Pool:  ethers.Contract[] = []

SC_Pool.push (SP_Oracle_SC)

const jupiterQuoteApi = createJupiterApiClient()

const solana_usdc = async (solona: string) => {

	const solanaDecimalPlaces = 9
	const usdcDecimalPlaces = 6
	const solanaNumber = ethers.parseUnits(solona, solanaDecimalPlaces).toString()
	// logger(Colors.blue(`solanaNumber = ${solanaNumber}`))
	const params: QuoteGetRequest = {
		inputMint: solanaAddr,
		outputMint: usdcAddr, // USDC
		amount: parseFloat(solanaNumber),
		slippageBps: 100, // 1%
	}

	const quote = await jupiterQuoteApi.quoteGet(params)
	const price_USDC = ethers.formatUnits(quote.outAmount, usdcDecimalPlaces)
	return price_USDC
}

const solana_usdt = async (solona: string) => {


	const solanaNumber = ethers.parseUnits(solona, solanaDecimalPlaces).toString()
	// logger(Colors.blue(`solanaNumber = ${solanaNumber}`))
	const params: QuoteGetRequest = {
		inputMint: solanaAddr,
		outputMint: usdtAddr,
		amount: parseFloat(solanaNumber),
		slippageBps: 100, // 1%
	}

	const quote = await jupiterQuoteApi.quoteGet(params)
	const price_USDT = ethers.formatUnits(quote.outAmount, usdtDecimalPlaces)

	return price_USDT
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
	return price_sp
}

const usdt_solana = async (usdt: string) => {

	const usdtNumber = ethers.parseUnits(usdt, usdtDecimalPlaces).toString()
	// logger(Colors.blue(`solanaNumber = ${usdtNumber}`))
	const params: QuoteGetRequest = {
		inputMint: usdtAddr,
		outputMint: solanaAddr,
		amount: parseFloat(usdtNumber),
		slippageBps: 100, // 1%
	}

	const quote = await jupiterQuoteApi.quoteGet(params)
	// const price_USDC = ethers.formatUnits(quote.outAmount, usdcDecimalPlaces)
	const solana = ethers.formatUnits(quote.outAmount, solanaDecimalPlaces)
	return solana
}


const usdc_solana = async (usdc: string) => {

	const usdcNumber = ethers.parseUnits(usdc, usdcDecimalPlaces).toString()
	// logger(Colors.blue(`solanaNumber = ${usdcNumber}`))
	const params: QuoteGetRequest = {
		inputMint: usdcAddr,
		outputMint: solanaAddr,
		amount: parseFloat(usdcNumber),
		slippageBps: 100, // 1%
	}

	const quote = await jupiterQuoteApi.quoteGet(params)
	// const price_USDC = ethers.formatUnits(quote.outAmount, usdcDecimalPlaces)
	const solana = ethers.formatUnits(quote.outAmount, solanaDecimalPlaces)
	return solana
}


const solana_sp = async (so: string) => {

	const usdcNumber = ethers.parseUnits(so, solanaDecimalPlaces).toString()
	// logger(Colors.blue(`solanaNumber = ${usdcNumber}`))
	const params: QuoteGetRequest = {
		inputMint: solanaAddr,
		outputMint: spAddr, //	$SP
		amount: parseFloat(usdcNumber),
		slippageBps: 100, // 1%
	}

	const quote = await jupiterQuoteApi.quoteGet(params)
	// const price_USDC = ethers.formatUnits(quote.outAmount, usdcDecimalPlaces)
	const sp = ethers.formatUnits(quote.outAmount, spDecimalPlaces)
	return sp
}

const getUed2SoPrice = async (usd: string) => {
	
	const [so1, so2] = await Promise.all([
		usdc_solana(usd),
		usdt_solana(usd)
	])
	if (so1 > so2) {
		return so1
	}
	return so2
}

const getSOlanaPrice = async () => {
	const solana = '1'
	const [usdc, usdt] = await Promise.all([
		solana_usdc(solana),
		solana_usdt (solana)
	])

	if (usdc > usdt) {
		return usdc
	}
	return usdt
}


const startOracle = async () => {
	const price1 = '2.49'
	const price2 = '24.99'
	const price3 = '9.99'
	const price4 = '99.99'

	const [_sp249, _sp2499, _sp999, _sp9999, so] = await Promise.all ([
		getUed2SoPrice(price1),
		getUed2SoPrice(price2),
		getUed2SoPrice(price3),
		getUed2SoPrice(price4),
		getSOlanaPrice()
	])

	const [sp249, sp2499, sp999, sp9999] = await Promise.all([
		solana_sp(_sp249),
		solana_sp(_sp2499),
		solana_sp(_sp999),
		solana_sp(_sp9999)
	])
	const ret: spOracle = {
		sp249, sp2499, sp999, sp9999, so
	}
	logger(inspect(ret, false, 3, true))
	storeOracle(ret)
}

const storeOracle = async (data: spOracle) => {
	const SC = SC_Pool.shift()
	if (!SC) {
		return logger(Colors.red(`storeOracle have on SC in SC POOL error`))
	}
	try {
		const sp249 = ethers.parseEther(data.sp249)
		const sp999 = ethers.parseEther(data.sp2499)
		const sp2499 = ethers.parseEther(data.sp999)
		const sp9999 = ethers.parseEther(data.sp9999)
		const so = ethers.parseEther(data.so)
		const tx = await SC.updatePrice(sp249, sp999, sp2499, sp9999, so)
		logger(data)
		await tx.wait()
		logger(Colors.blue(`storeOracle success! ${tx.hash}`))
	} catch (ex: any) {
		logger(Colors.red(`storeOracle Error ${ex.message}`))
	}
	SC_Pool.unshift(SC)

}

let currentBlock = 0

const daemondStart = async () => {
	
	currentBlock = await endPointCancun.getBlockNumber()
	logger(Colors.magenta(`CoNET DePIN passport airdrop daemon Start from block [${currentBlock}]`))
	endPointCancun.on('block', async block => {
		if (block > currentBlock) {
			currentBlock = block
			if (block % 10 === 0) {
				startOracle()
			}
			
		}
		
	})
}

daemondStart()