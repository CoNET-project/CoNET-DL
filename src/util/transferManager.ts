
import {logger} from './logger'
import Color from 'colors/safe'
import {conet_Holesky_rpc, cCNTP_Contract, mergeTransfersv1} from './util'
import {ethers} from 'ethers'
import {abi as CONET_Point_ABI} from './conet-point.json'

interface transferObj {
	privateKey: string
	walletList: string[]
	payList: string []
}
export const transferPool: transferObj[] = []
let startTransfering = false
let marginPooling = false


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


export const startTransfer = async () => {
	if (startTransfering) {
		return
	}
	startTransfering = true

	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const feeData = await provideCONET.getFeeData()
	const gasPrice = feeData.gasPrice ? parseFloat((feeData.gasPrice/BigInt(10**9)).toString()) : 0
	marginPool()
	if (gasPrice > 1 || !gasPrice) {
		startTransfering = false
		return logger(Color.red(`startTransfer GAS [${gasPrice}] > 5 || gasPrice === 0, waiting to Low! transferPool legnth = [${transferPool.length}]`))
	}
	
	const obj = transferPool.shift()

	if (!obj) {
		startTransfering = false
		return logger(Color.grey(`startTransfer Pool Empty, STOP startTransfer  GAS fee is [${gasPrice}]`))
	}

	return transferCCNTP(obj.privateKey, obj.walletList, obj.payList, () => {
		startTransfering = false
		startTransfer ()
	})
}

const transferCCNTP = (privateKey: string, walletList: string[], PayList: string[], callback: () => void) => {
	if (walletList.length < 1) {
		return callback()
	}
	const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const wallet = new ethers.Wallet(privateKey, provider)
	const cCNTPContract = new ethers.Contract(cCNTP_Contract, CONET_Point_ABI, wallet)
	let amount = 0
	PayList.forEach(n => amount += parseFloat(n))
	const payList = PayList.map(n => ethers.parseEther(n))
	const send: any = async () => {
		
		let tx
		try {
			tx = await cCNTPContract.multiTransferToken(walletList, payList)
		} catch (ex) {
			logger(Color.red(`transferCCNTP Error! = [${walletList.length}] Wallet = [${wallet.address}]`))
			return setTimeout(() => {
				return send()
			}, 1000)
		}
		logger (Color.magenta(`transferCCNTP [${walletList.length}] amount[${amount}] success!`))
		callback()
	}
	send()
}