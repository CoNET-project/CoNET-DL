import {BlobLike, ethers} from 'ethers'
import {logger} from './logger'
import Color from 'colors/safe'
import {abi as CONET_Point_ABI} from './conet-point.json'
import { inspect } from 'node:util'
import {mapLimit} from 'async'
const rpcUrl = 'https://rpc.conet.network'
const CNTP_Addr = '0xa4b389994A591735332A67f3561D60ce96409347'
const transferTimeout = 1000 * 180			//	3 mins
const checkGasPrice = 2000010007
const longestWaitingTime = 1000 * 60 * 5	//	5 mins
const MaxWaitingTimes = 10
export default class CNTP_Transfer_Manager {

	private pool: Map<string, number> = new Map()
	private rpcProvider = new ethers.JsonRpcProvider(rpcUrl)
	private privatePayArray: ethers.Wallet [] = []
	private epoch = 0
	private privateWalletCurrentPoint = 0
	private transferProcessStatus = false
	private lastTransferTimeStamp = new Date().getTime()

	private transferCNTP: (wallets: string[], pays: number[], wallet: ethers.Wallet) => Promise<boolean> =  (wallets, pays, wallet: ethers.Wallet) => new Promise(async resolve => {
		const CNTP_Contract = new ethers.Contract(CNTP_Addr, CONET_Point_ABI, wallet)
		let total = 0
		const fixedPay = pays.map(n => ethers.parseEther(n.toFixed(6)))
		pays.forEach(n => {
			total += n
		})
		let transferCNTP_waitingProcess_times = 0

		const transferCNTP_waitingProcess: (tx: ethers.TransactionResponse) => Promise<boolean> = (tx) => new Promise(async _resolve => {
			logger(inspect(tx, false, 3, true ))

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
			
			logger(Color.blue(`transferCNTP_waitingProcess SUCCESS! [${ks.hash}]`))
			logger(inspect(ks, false, 3, true))
			_resolve (true)
		})
		
		try {
			const tx = await CNTP_Contract.multiTransferToken (wallets, fixedPay)
			logger(Color.magenta(`transferCNTP [${wallets.length}] Total CNTP ${total} Send to RPC, hash = ${tx.hash}`))
			tx.data = ''
			return resolve(await transferCNTP_waitingProcess (tx))

		} catch (ex) {
			logger(Color.red(`CNTP_Transfer_Manager transferCNTP Error!`), ex)
			console.log('\n\n',JSON.stringify(wallets), '\n\n')
			console.log('\n\n',JSON.stringify(pays), '\n\n')
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
		}
		this.lastTransferTimeStamp = timeStamp
		const splitGroupNumber = Math.round (this.pool.size / this.eachTransLength + 0.5)
		const eachGroupLength = Math.floor(this.pool.size / splitGroupNumber)
		let iii = 0, items = 0
		const wallets: string[][] = []
		const pay: number[][] = []
		wallets[0] = []
		pay[0] = []
		logger(Color.magenta(`transferProcess pool size = ${this.pool.size} Max length = ${this.eachTransLength} split ${splitGroupNumber} Group Each group size = ${eachGroupLength}`))

		this.pool.forEach((v, key) => {
			if (v === 0) {
				return this.pool.delete(key)
			}
			const groupSplit = iii % eachGroupLength
			if (iii > 0 && !groupSplit ) {
				iii++
				wallets[iii] = []
				pay[iii] = []
			}
			wallets[iii].push(key)
			pay[iii].push(v)
			return this.pool.delete(key)
		})

		let iii_1 = 0

		await mapLimit(wallets, 1, async (n, next) => {
			const waitTransfer = await this.transferCNTP(n, pay[iii_1], this.getPrivateWallet())
			if (!waitTransfer) {
				logger(Color.red(`transferCNTP got Error return transfer group [${ n.length }] to Pool, current Pool size = ${this.pool.size}! `))
				this.addToPool (n, pay[iii_1])
			}
			iii_1 ++
			logger(Color.blue(`transferProcess work number ${iii_1} finished by result ${waitTransfer} !`))
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
			const pay = (this.pool.get (wallet)|| 0) + payArray[index]
			this.pool.set(wallet, pay)
		})

		logger(Color.red(`CNTP_Transfer_Manager addToPool success! Array [${wallets.length}] added to Pool [${this.pool.size}]`))
	}
	
}