import {ethers} from 'ethers'

import {masterSetup, getIPFSfile} from './util'
import Color from 'colors/safe'
import { logger } from './logger'

import {transferPool, startTransfer} from '../util/transferManager'

import rateABI from '../endpoint/conet-rate.json'
const conet_Holesky_RPC = 'https://rpc.conet.network'
const provider = new ethers.JsonRpcProvider(conet_Holesky_RPC)

const rateAddr = '0x9C845d9a9565DBb04115EbeDA788C6536c405cA1'.toLowerCase()

const splitLength = 900

const stratFreeMinerTransfer = async (block: number) => {

	const data = await getIPFSfile (`free_wallets_${block}`)
	
	if (!data) {
		return logger(Color.red(`stratFreeMinerReferrals get EPOCH ${block} free_wallets_${block} error!`))
	}
	let walletArray: string[]
	
	try{
		walletArray = JSON.parse(data)
	} catch (ex) {
		return logger(Color.red(`stratFreeMinerReferrals free_wallets_${block} JSON parse Error!`))
	}
	
	if (!walletArray.length) {
		return logger(Color.red(`stratFreeMinerReferrals free_wallets_${block} Arraay is empty!`))
	}

	const rateSC = new ethers.Contract(rateAddr, rateABI, provider)

	const rate = await rateSC.rate()
	const minerRate =rate/BigInt(walletArray.length)


	console.error(Color.blue(`daemon EPOCH = [${block}] starting! rate [${ethers.formatEther(rate)}] minerRate = [${ ethers.formatEther(minerRate) }] MinerWallets length = [${walletArray.length}]`))

	const kkk = walletArray.length
	const splitTimes = kkk < splitLength ? 1 : Math.round(kkk/splitLength)
	const splitBase =  Math.round(kkk/splitTimes)
	const dArray: string[][] = []

	logger(Color.grey(`Array total = ${kkk} splitTimes = ${splitTimes} splitBase ${splitBase} payList = ${ethers.formatEther(minerRate)}`))

	for (let i = 0, j = 0; i < kkk; i += splitBase, j ++) {
		const a  = walletArray.slice(i, i+ splitBase)
		dArray[j] = a
	}

	if (masterSetup.conetFaucetAdmin.length < dArray.length ) {
		return logger(Color.red(` masterSetup.conetFaucetAdmin.length [${masterSetup.conetFaucetAdmin.length}] < dArray.length [${dArray.length}] Error! Stop startTransfer !`),'\n')
	}

	dArray.forEach( (n, index) => {
		transferPool.push({
			privateKey: masterSetup.conetFaucetAdmin[index],
			walletList: n,
			payList: n.map(n => ethers.formatEther(minerRate))
		})
	})
	
	logger(Color.blue(`transferPool.length = ${transferPool.length}`))
	await startTransfer()
}


const startListeningCONET_Holesky_EPOCH_v2 = async () => {
	provider.on('block', async block => {
		stratFreeMinerTransfer(block-2)
	})
}

startListeningCONET_Holesky_EPOCH_v2()