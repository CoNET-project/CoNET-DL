import {BlobLike, ethers} from 'ethers'
import {logger} from './logger'
import Color from 'colors/safe'
import CNTP_multiTransferTokenABI from './CNTP_multiTransferTokenABI.json'
import { inspect } from 'node:util'
import {mapLimit} from 'async'
const rpcUrl = 'https://cancun-rpc.conet.network'
import CoNETDePINMiningABI from './CoNETDePINMiningABI.json'

const CoNETDePINMiningContract = '0x3B91CF65A50FeC75b9BB69Ded04c12b524e70c29'


const transferTimeout = 1000 * 180			//	3 mins
const checkGasPrice = 15000000
const longestWaitingTime = 1000 * 60 * 15	//	5 mins

interface paymentItem {
	wallets: string[]
	pays: number[]
}



const rpcProvider = new ethers.JsonRpcProvider(rpcUrl)

export class CNTP_Transfer_Manager {

	private pool: Map<string, number> = new Map()
	private privatePayArray: ethers.Contract [] = []
	private epoch = 0
	private privateWalletCurrentPoint = 0
	private transferProcessStatus = false
	private lastTransferTimeStamp = new Date().getTime()

	private transferCNTP: (wallets: string[], pays: number[]) => Promise<boolean> =  (wallets, pays) => new Promise(async resolve => {
		if (wallets.length !== pays.length) {
			logger(Color.red(`transferCNTP wallets.length = ${wallets.length} !== pays length ${pays.length}`))
			return resolve (false)
		}

		const CNTP_Contract = this.privatePayArray.shift()
		if (!CNTP_Contract) {
			return setTimeout(async () => {
				resolve(await this.transferCNTP(wallets, pays))
			}, 1000)
		}


		let total = 0
		const fixedPay = pays.map(n => ethers.parseEther(n.toFixed(6)))
		pays.forEach(n => {
			total += n
		})
		let transferCNTP_waitingProcess_times = 0

		const transferCNTP_waitingProcess: (tx: ethers.TransactionResponse) => Promise<boolean> = (tx) => new Promise(async _resolve => {
			const time = setTimeout(() => {
				logger(Color.red(`CNTP_Transfer_Manager transferCNTP Timeout Error! transferCNTP_waitingProcess_times = [${transferCNTP_waitingProcess_times}]`))
				return _resolve(false)
			}, transferTimeout)

			const ks = await tx.wait (1)
			clearTimeout(time)
			if (!ks) {
				logger(Color.red(`transferCNTP_waitingProcess Got await tx.wait (1) null return STOP waiting!`))
				return _resolve (false)
			}
			logger(inspect(ks, false, 3, true))
			_resolve (true)
		})
		
		try {
			const tx = await CNTP_Contract.mining (wallets, fixedPay)
			logger(Color.magenta(`transferCNTP [${wallets.length}] Total CNTP ${total} Send to RPC, hash = ${tx.hash} `))
			this.privatePayArray.push(CNTP_Contract)
			return resolve(await transferCNTP_waitingProcess (tx))

		} catch (ex) {
			logger(Color.red(`CNTP_Transfer_Manager wallets ${wallets.length} pays [${pays.length }] Data Langth ${JSON.stringify(wallets).length + JSON.stringify(fixedPay.map(n => n.toString())).length} transferCNTP Error! `), ex)
			console.log('\n\n',JSON.stringify(wallets), '\n\n')
			console.log('\n\n',JSON.stringify(fixedPay.map(n => n.toString())), '\n\n')
			this.privatePayArray.push(CNTP_Contract)
			return resolve (false)
		}
		
	})

	private getPrivateWallet = () => {
		++this.privateWalletCurrentPoint
		if ( this.privateWalletCurrentPoint > this.privatePayArray.length - 1) {
			this.privateWalletCurrentPoint = 0
		}
		return this.privatePayArray[this.privateWalletCurrentPoint]
	}
		
	
	private transferProcess = async () => {
		if (this.transferProcessStatus || !this.pool.size ) {
			return logger(Color.grey(`CNTP_Transfer_Manager transferProcess stoped transferProcessStatus = ${this.transferProcessStatus} || pool.size ${this.pool.size}`))
		}

		this.transferProcessStatus = true
		const timeStamp = new Date().getTime()
		const feeData = await rpcProvider.getFeeData()
		logger(inspect(feeData, false, 3, true))

		if (!feeData.gasPrice) {
			this.transferProcessStatus = false
			return logger(Color.red(`transferProcess start with GAS NULL ERROR`))
		}

		const gasPrice = parseFloat(feeData.gasPrice.toString())

		if ( gasPrice > checkGasPrice) {
			if (timeStamp - this.lastTransferTimeStamp < longestWaitingTime) {
				this.transferProcessStatus = false
				return logger(Color.grey(`startTransfer GAS [${gasPrice}] > ${checkGasPrice} || gasPrice === 0, waiting to Low! transferPool legnth = [${this.pool.size}]`))
			}
			logger(Color.grey(`startTransfer NOW GAS [${gasPrice}] vs ${checkGasPrice} because timeStamp - this.lastTransferTimeStamp < longestWaitingTime = ${timeStamp - this.lastTransferTimeStamp < longestWaitingTime} [${this.pool.size}]`))
		} else {
			logger(Color.grey(`startTransfer NOW GAS [${gasPrice}] vs ${checkGasPrice}  [${this.pool.size}]`))
		}
		this.lastTransferTimeStamp = timeStamp
		const splitGroupNumber = Math.round (this.pool.size / this.eachTransLength + 0.5)
		const eachGroupLength = Math.floor(this.pool.size / splitGroupNumber)

		const item: paymentItem[] = []
		
		let groupCount = 0
		let items = 0

		let wallets: string[] = []
		let pays: number [] = []

		this.pool.forEach((v, key) => {
			if (v === 0) {
				return
			}

			const groupSplit = items % eachGroupLength

			if (!groupSplit) {
				item[groupCount] = {
					wallets,
					pays
				}

				if (items > 0) {
					groupCount ++
				}
				
				wallets = []
				pays = []
			}
			
			this.pool.delete(key)
			pays.push(v)
			wallets.push(key)
			items ++
			
			return 
		})

		
		item[groupCount]={
			wallets, pays
		}
		
		
		logger(Color.magenta(`transferProcess pool size = ${this.pool.size} Max length = ${this.eachTransLength} split ${splitGroupNumber} Group wallets size = ${item.map(n => n.wallets.length)}`))
		let iii_1 = 0

		await mapLimit(item, this.privatePayArray.length, async (n, next) => {
			logger(Color.magenta(`start transferCNTP group [${iii_1}] wallets ${n.wallets.length} pays length = ${n.pays.length}`))
			
			const waitTransfer = await this.transferCNTP(n.wallets, n.pays)
			if (!waitTransfer) {
				logger(Color.red(`transferCNTP [${iii_1}] got Error return transfer group wallet length [${ n.wallets.length }] pay length [${n.pays.length}]to Pool, current Pool size = ${this.pool.size}! `))
				this.addToPool (n.wallets,n.pays)
			} else {
				logger(Color.blue(`transferProcess work number ${iii_1} finished by result ${waitTransfer} !`))
			}
			
			iii_1 ++
			
		})


		this.transferProcessStatus = false
		logger(Color.blue(`Epoch ${this.epoch} transfer Process finished! pool size = ${this.pool.size}`))
	}

	private initCalss = async (privateKeys: string[]) => {
		privateKeys.forEach(n => {
			const wall = new ethers.Wallet(n, rpcProvider)
			const contract = new ethers.Contract(CoNETDePINMiningContract, CoNETDePINMiningABI, wall)
			logger(Color.magenta(`initCalss wallet ${wall.address} added to POOL!`))
			this.privatePayArray.push(contract)
		})

		this.epoch = await rpcProvider.getBlockNumber()
		logger(Color.blue(`CNTP_Transfer_Manager started at EPOCH ${this.epoch}`))

		rpcProvider.on ('block', async _block => {
			if (_block = this.epoch + 1 ) {
				this.epoch ++
				logger(Color.blue(`CNTP_Transfer_Manager start EPOCH ${this.epoch} transfer`))
				this.transferProcess ()
			}
		})
		
	}

	constructor(privateKeys: string[], private eachTransLength: number) {
		this.initCalss(privateKeys)
	}

	public addToPool = (wallets: string[], payArray: number[]) => {
		if (wallets.length !== payArray.length) {
			return logger(Color.red(`CNTP_Transfer_Manager addToPool wallets[${wallets.length}] !== payArray [${payArray.length}] Error!`))
		}

		wallets.forEach((n, index) => {
			const wallet = n.toLowerCase()
			const before = this.pool.get (wallet) || 0
			const pay = before + payArray[index]
			//logger(Color.magenta(`added wallet ${wallet} before [${before}] + payArray = [${payArray}] = after [${pay}]`))
			this.pool.set(wallet, pay)
		})

		logger(Color.red(`CNTP_Transfer_Manager addToPool success! Array [${wallets.length}] added to Pool [${this.pool.size}]`))
	}
	
}


// const adminList = async (_wallet: string) => {
	
// 	const CNTP_Contract = new ethers.Contract(CNTP_multiTransfer, CNTP_multiTransferTokenABI, rpcProvider)
// 	const ss = await CNTP_Contract.adminList(_wallet)
// 	logger(Color.magenta(`[${_wallet}] in adminList is ${ss}`))
// }

// const testMultiTransferToken = async (_wallet: string) => {
// 	const wallet = new ethers.Wallet(_wallet, rpcProvider)
// 	logger(Color.blue(wallet.address))
// 	const CNTP_Contract = new ethers.Contract(CNTP_multiTransfer_new1, CNTP_multiTransferTokenABI, wallet)
// 	const wallets = ['0x0981275553A41E00ec1006fe074971285E00c2A3']
// 	const fixedPay = [ethers.parseEther('0.1')]
// 	try {
// 		const tx = await CNTP_Contract.multiTransferToken (wallets, fixedPay)
// 		logger(inspect(tx, false, 3, true))
// 	} catch (ex) {
// 		logger(ex)
// 	}
	
// }

