import {ethers} from 'ethers'

import {masterSetup, getIPFSfile, mergeTransfersv1} from './util'
import Color from 'colors/safe'
import { logger } from './logger'
import {mapLimit} from 'async'

import {checkGasPrice, longestWaitingTime, transferCCNTP } from '../util/transferManager'

import rateABI from '../endpoint/conet-rate.json'
const conet_Holesky_RPC = 'https://rpc.conet.network'
const provider = new ethers.JsonRpcProvider(conet_Holesky_RPC)

const rateAddr = '0x9C845d9a9565DBb04115EbeDA788C6536c405cA1'.toLowerCase()

const splitLength = 900

let waitingWalletArray: string[] = []
let waitingPayArray: string[] = []
let lastTransferTimeStamp = new Date().getTime()

const epoch: number[] = []

const startTransfer = (privateKey: string, wallets: string[], payList: string[]) => new Promise(resolve => {
	return transferCCNTP (privateKey, wallets, payList, async err => {
		if (err) {
			return setTimeout(async () => {
				resolve (await startTransfer (privateKey, wallets, payList))
			}, 1000)
		}
		return resolve (true)
	})
})

const startTransferAll = async () => {
	if (waitingWalletArray.length == 0) {
		return logger(`startTransferAll has waitingWalletArray is null to STOP`)
	}
	const feeData = await provider.getFeeData()
	const gasPrice = feeData.gasPrice ? parseFloat(feeData.gasPrice.toString()): checkGasPrice+1
	const timeStamp = new Date().getTime()

	if ((gasPrice > checkGasPrice || !gasPrice )) {
		if (timeStamp - lastTransferTimeStamp < longestWaitingTime) {
			return logger(Color.red(`startTransfer GAS [${gasPrice}] > ${checkGasPrice}`))
		}
	}

	const kkk = waitingWalletArray.length
	const splitTimes = kkk < splitLength ? 1 : Math.round(kkk/splitLength)
	const splitBase =  Math.floor(kkk/splitTimes)
	const dArray: string[][] = []
	const pArray: string[][] = []


	for (let i = 0, j = 0; i < kkk; i += splitBase, j ++) {
		const a  = waitingWalletArray.slice(i, i+ splitBase)
		const b  = waitingPayArray.slice(i, i+ splitBase)
		dArray[j] = a
		pArray[j] = b
	}

	if (masterSetup.conetFaucetAdmin.length < dArray.length ) {
		return logger(Color.red(` masterSetup.conetFaucetAdmin.length [${masterSetup.conetFaucetAdmin.length}] < dArray.length [${dArray.length}] Error! Stop startTransfer !`),'\n')
	}

	const transferPool: any[]= []
	dArray.forEach( (n, index) => {
		const paymentList = pArray[index]

		if (index > masterSetup.conetFaucetAdmin.length-1) {
			index = 0
		}
		transferPool.push({
			privateKey: masterSetup.conetFaucetAdmin[index],
			walletList: n,
			payList: paymentList
		})
	})
	
	logger(Color.blue(`transferPool.length = ${transferPool.length}`))

	await mapLimit(transferPool, 1, async ( n, next) => {
		await startTransfer (n.privateKey, n.walletList, n.payList)
	})

	logger (`stratFreeMinerTransfer success! `)
	waitingWalletArray = waitingPayArray = []
	lastTransferTimeStamp = new Date().getTime()
	stratFreeMinerTransfer ()
}

const stratFreeMinerTransfer = async () => {

	if (epoch.length === 0) {
		return startTransferAll ()
	}
	const block = epoch.shift()
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

	
	walletArray.forEach(n => {
		waitingWalletArray.push(n)
		waitingPayArray.push(ethers.formatEther(minerRate))
	})

	const merged = mergeTransfersv1 (waitingWalletArray, waitingPayArray)
	waitingWalletArray = merged.walletList
	waitingPayArray = merged.payList
	stratFreeMinerTransfer ()
}


const startListeningCONET_Holesky_EPOCH_v2 = async () => {
	provider.on('block', async block => {
		epoch.push(block-2)
		stratFreeMinerTransfer()
	})
}

startListeningCONET_Holesky_EPOCH_v2()