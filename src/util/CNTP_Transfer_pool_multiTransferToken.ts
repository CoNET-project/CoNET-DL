import {BlobLike, ethers} from 'ethers'
import {logger} from './logger'
import Color from 'colors/safe'
import CNTP_multiTransferTokenABI from './CNTP_multiTransferTokenABI.json'
import { inspect } from 'node:util'
import {mapLimit} from 'async'
const rpcUrl = 'https://rpc.conet.network'
const CNTP_multiTransfer = '0x1250818e17D0bE3851E2B5769D9262a48fAB7065'
const transferTimeout = 1000 * 180			//	3 mins
const checkGasPrice = 15000000
const longestWaitingTime = 1000 * 60 * 15	//	5 mins

interface paymentItem {
	wallets: string[]
	pays: number[]
}

export class CNTP_Transfer_Manager {

	private pool: Map<string, number> = new Map()
	private rpcProvider = new ethers.JsonRpcProvider(rpcUrl)
	private privatePayArray: ethers.Wallet [] = []
	private epoch = 0
	private privateWalletCurrentPoint = 0
	private transferProcessStatus = false
	private lastTransferTimeStamp = new Date().getTime()

	private transferCNTP: (wallets: string[], pays: number[], wallet: ethers.Wallet) => Promise<boolean> =  (wallets, pays, wallet: ethers.Wallet) => new Promise(async resolve => {
		if (wallets.length !== pays.length) {
			logger(Color.red(`transferCNTP wallets.length = ${wallets.length} !== pays length ${pays.length}`))
			return resolve (false)
		}
		const CNTP_Contract = new ethers.Contract(CNTP_multiTransfer, CNTP_multiTransferTokenABI, wallet)
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
			const tx = await CNTP_Contract.multiTransferToken (wallets, fixedPay)
			logger(Color.magenta(`transferCNTP [${wallets.length}] Total CNTP ${total} Send to RPC, action wallet ${wallet.address} hash = ${tx.hash} `))
			return resolve(await transferCNTP_waitingProcess (tx))

		} catch (ex) {
			logger(Color.red(`CNTP_Transfer_Manager wallets ${wallets.length} pays [${pays.length }] Data Langth ${JSON.stringify(wallets).length + JSON.stringify(fixedPay.map(n => n.toString())).length} transferCNTP Error! `), ex)
			console.log('\n\n',JSON.stringify(wallets), '\n\n')
			console.log('\n\n',JSON.stringify(fixedPay.map(n => n.toString())), '\n\n')
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
		const feeData = await this.rpcProvider.getFeeData()
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
			// logger(inspect(n.wallets, false, 3, true))
			// logger(inspect(n.pays, false, 3, true))
			const waitTransfer = await this.transferCNTP(n.wallets, n.pays, this.getPrivateWallet())
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
			this.privatePayArray.push(new ethers.Wallet(n, this.rpcProvider))
		})

		this.epoch = await this.rpcProvider.getBlockNumber()
		logger(Color.blue(`CNTP_Transfer_Manager started at EPOCH ${this.epoch}`))

		this.rpcProvider.on ('block', async _block => {
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