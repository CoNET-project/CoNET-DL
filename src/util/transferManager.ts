
import {logger} from './logger'
import Color from 'colors/safe'
import {newCNTP_v8, mergeTransfersv1} from './util'
import {ethers} from 'ethers'
import {abi as CONET_Point_ABI} from './conet-point.json'
import { inspect } from 'node:util'

interface transferObj {
	privateKey: string
	walletList: string[]
	payList: string []
}

export const transferPool: transferObj[] = []
let startTransfering = false
let marginPooling = false

const conet_Holesky_rpc = new ethers.JsonRpcProvider('https://rpc.conet.network')
const marginPool = () => {
	if (marginPooling) {
		return logger(Color.red(`marginPool stoped because other marginPool is processing!`))
	}
	marginPooling = true
	const reTransferPool: transferObj[] = []

	const next = (obj: transferObj) => {
		const index = transferPool.findIndex(n => n.privateKey === obj.privateKey)
		if (index < 0) {
			const margened = mergeTransfersv1(obj.walletList, obj.payList)
			obj.walletList = margened.walletList
			obj.payList = margened.payList
			return
		}
		const _obj = transferPool.splice(index, 1)
		_obj[0].walletList.forEach((n, nI) => {
			obj.walletList.push(n)
			obj.payList.push(_obj[0].payList[nI])
		})
		next (obj)
	}

	const margin = () => {

		const obj = transferPool.shift()
		if (!obj) {
			reTransferPool.forEach(n => {
				transferPool.push (n)
			})
			marginPooling = false
			
			return 
		}
		next(obj)
		reTransferPool.push(obj)
		margin()
	}
	margin()
}

export const checkGasPrice = 2000010007
let lastTransferTimeStamp = new Date().getTime()
export const longestWaitingTime = 1000 * 60 * 10
let transferWithoutGasFee = false
let transferWithoutGasFeeLoopLength = 0

const startTransfer = async () => {

	if (startTransfering) {
		return
	}

	startTransfering = true

	const feeData = await conet_Holesky_rpc.getFeeData()
	const gasPrice = feeData.gasPrice ? parseFloat(feeData.gasPrice.toString()): checkGasPrice+1
	marginPool()
	const timeStamp = new Date().getTime()

	if ( !transferWithoutGasFee && (gasPrice > checkGasPrice || !gasPrice )) {
		if (timeStamp - lastTransferTimeStamp > longestWaitingTime) {
			transferWithoutGasFee = true
			transferWithoutGasFeeLoopLength = transferPool.length
		} else {
			startTransfering = false
			return logger(Color.grey(`startTransfer GAS [${gasPrice}] > ${checkGasPrice} || gasPrice === 0, waiting to Low! transferPool legnth = [${transferPool.length}]`))
		}
	}

	if (transferWithoutGasFee) {
		if (--transferWithoutGasFeeLoopLength < 0) {
			transferWithoutGasFee = false
		}
	}

	const obj = transferPool.shift()
	
	if (!obj) {
		startTransfering = false
		return logger(Color.grey(`startTransfer Pool Empty, STOP startTransfer  GAS fee is [${gasPrice}]`))
	}

	logger(Color.grey(`startTransfer transferPool total length = ${transferPool.length} waiting list length = ${obj.walletList.length} `))

	return transferCCNTP(obj.privateKey, obj.walletList, obj.payList, (err) => {
		
		startTransfering = false
		if (err) {
			transferPool.unshift(obj)
		} else {
			lastTransferTimeStamp = new Date().getTime()
		}

		setTimeout(() => {
			startTransfer ()
		}, 2000)
		
	})
}

const searchWallet = '0xA6827E09f6aC9Ff28beB0CF6aEB7EF05F1A73DF1'
const watchWallets = ['0x454428d883521c8af9e88463e97e4d343c600914','0x28b2ae27e135e89d9bcb40595f859b411bf4846c','0x9a748729704174d411fc646efbd458f4c0e4ea40']
export const transferCCNTP = (privateKey: string, __walletList: string[], __PayList: string[], callback: (err?: Error) => void) => {
	if (__walletList.length < 1) {
		return callback()
	}
	const fixedWallet:string[] = []
	const fixedPayList: string[] = []
	__walletList.forEach((v, i) => {
		const uu = ethers.isAddress(v)
		if (!uu) {
			return logger(`transferCCNTP WalletAddress Error! [${v}] Pay [${__PayList[i]}]`)
		}
		fixedWallet.push(v)
		fixedPayList.push(__PayList[i])
	})

	const wallet = new ethers.Wallet(privateKey, conet_Holesky_rpc)
	const cCNTPContract = new ethers.Contract(newCNTP_v8, CONET_Point_ABI, wallet)
	let amount = 0
	fixedPayList.forEach(n => amount += parseFloat(n))
	const payList = fixedPayList.map(n => ethers.parseEther(parseFloat(n).toFixed(10)))
	
	const send: any = async () => {
		// const index = __walletList.findIndex(n => n.toLowerCase() === searchWallet.toLowerCase())
		// const balance2 = await cCNTPContract.balanceOf(fixedWallet[0])
		// let balance3 = 0
		// if (index > -1) {
		// 	balance3 = await cCNTPContract.balanceOf(searchWallet)
		// }
		let tx
		try {
			
			tx = await cCNTPContract.multiTransferToken(fixedWallet, payList)
		} catch (ex: any) {
			logger(Color.red(`transferCCNTP Error! [${fixedWallet.length}] Wallet = [${wallet.address}] amount[${amount}]`))

			return callback(ex)
			// return setTimeout(() => {
			// 	return send()
			// }, 1000)
		}
		if (watchWallets.length) {
			watchWallets.forEach(n => {
				const index = fixedWallet.findIndex(nn => nn.toLowerCase() === n)
				if (index > -1) {
					logger(`Send CNTP [${payList[index]}] to watchWallets ${n} success!!!!!!!!!!`)
				}
				
			})
		}
		logger (Color.magenta(`transferCCNTP Wallet = [${wallet.address}] [${fixedWallet.length}] amount[${amount}] tx = [${tx.hash}] success!`))
		// logger(inspect(fixedWallet.slice(0, 2), false, 3, true), inspect(payList.slice(0, 2), false, 3, true))
		//const balance1 = await cCNTPContract.balanceOf(fixedWallet[0])
		//logger(Color.red(`getBrance array[0] [$${fixedWallet[0]}] pay[${ethers.formatEther(payList[0])}] balance2 [${ethers.formatEther(balance2)}] ===>  ${ethers.formatEther(balance1)}`))
		

		// if (index > -1) {
			
		// 	const balance = await cCNTPContract.balanceOf(searchWallet)
		// 	logger(Color.red(`transferCCNTP wallet [${searchWallet}] pay [${ethers.formatEther(payList[index])}] balance [${ethers.formatEther(balance3)}]  => [${ethers.formatEther(balance)}]!!! `))
		// }
		
		// logger(inspect(walletList, false, 3, true), inspect(PayList, false, 3, true))
		callback()
	}
	send()
	
}
