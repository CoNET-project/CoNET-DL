import {ethers} from 'ethers'

import {masterSetup, getIPFSfile, mergeTransfersv1} from './util'
import Color from 'colors/safe'
import { logger } from './logger'
import {mapLimit} from 'async'

import {checkGasPrice, longestWaitingTime, transferCCNTP } from '../util/transferManager'

import rateABI from '../endpoint/conet-rate.json'
const conet_Holesky_RPC = 'https://rpc2.conet.network'
const provider = new ethers.JsonRpcProvider(conet_Holesky_RPC)

const rateAddr = '0x3258e9631ca4992F6674b114bd17c83CA30F734B'.toLowerCase()

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

	const transferPool: any[]= []
	let i = 0
	dArray.forEach( (n, index) => {
		const paymentList = pArray[index]
		i ++
		if (i > masterSetup.newFaucetAdmin.length-1) {
			i = 0
		}
		transferPool.push({
			privateKey: masterSetup.newFaucetAdmin[i],
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
		stratFreeMinerTransfer()
		return logger(Color.red(`stratFreeMinerReferrals get EPOCH ${block} free_wallets_${block} error!`))
	}
	let walletArray: string[]
	
	try{
		walletArray = JSON.parse(data)
	} catch (ex) {
		stratFreeMinerTransfer()
		return logger(Color.red(`stratFreeMinerReferrals free_wallets_${block} JSON parse Error!`))
	}
	
	if (!walletArray.length) {
		stratFreeMinerTransfer()
		return logger(Color.red(`stratFreeMinerReferrals free_wallets_${block} Arraay is empty!`))
	}
	const rateSC = new ethers.Contract(rateAddr, rateABI, provider)
	const rate = await rateSC.rate()
	const minerRate =rate/BigInt(walletArray.length)
	console.error(Color.blue(`daemon EPOCH = [${block}] starting! rate [${ethers.formatEther(rate)}] minerRate = [${ ethers.formatEther(minerRate) }] waitingWalletArray = ${waitingWalletArray.length} waitingPayArray = ${waitingPayArray.length} MinerWallets length = [${walletArray.length}]`))

	waitingWalletArray = [...waitingWalletArray, ...walletArray]
	waitingPayArray = [...waitingPayArray, ...walletArray.map(n => ethers.formatEther(minerRate))]

	logger(`walletArray.forEach success! waitingWalletArray === ${waitingWalletArray.length}, waitingPayArray = ${waitingPayArray.slice(0,5)} waitingWalletArray = ${waitingWalletArray.slice(0,5)}`)

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