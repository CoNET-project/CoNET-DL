/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import {claimeToekn, conet_lotte_new} from './help-database'
import Colors from 'colors/safe'
import Cluster from 'node:cluster'
import { masterSetup, getServerIPV4Address, conet_Holesky_rpc} from '../util/util'
import {logger} from '../util/logger'
import {v4} from 'uuid'
import CGPNsABI from '../util/CGPNs.json'
import devplopABI from './develop.ABI.json'
import {ethers} from 'ethers'
import type { RequestOptions } from 'node:http'
import {request} from 'node:http'
import {cntpAdminWallet, initNewCONET, startEposhTransfer} from './utilNew'
import {mapLimit} from 'async'
import faucet_v3_ABI from './faucet_v3.abi.json'
import Ticket_ABI from './ticket.abi.json'
import CNTP_TicketManager_class  from '../util/CNTP_Transfer_pool_useTicketManager'
import profileABI from './profile.ABI.json'
import tickerManagerABi from '../util/CNTP_ticketManager.ABI.json'
import dailyClick_ABI from './dailyClick.ABI.json'

import {dailyTaskSC} from '../util/dailyTaskChangeHash'

const CGPNsAddr = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'.toLowerCase()
const dailyClickAddr = '0x6d97059A01bF489Ad1b28a4E3591069b5eE12a23'
const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`

//	for production
	import {createServer} from 'node:http'


//	for debug
	// import {createServer as createServerForDebug} from 'node:http'

const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version
const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
const gameWallet0 = new ethers.Wallet (masterSetup.constGAMEAccount[0], provideCONET)
const dailyClickContract = new ethers.Contract(dailyClickAddr, dailyClick_ABI, gameWallet0)
const detailTransfer = async (tx: string) => {
	const transObj = await provideCONET.getTransactionReceipt(tx)

	const toAddr = transObj?.to?.toLowerCase()
	
	if ( CGPNsAddr === toAddr) {
		return await getAllOwnershipOfGuardianNodes()
	}
}

const listeningGuardianNodes = async (block: number) => {
	logger(Colors.gray(`listeningGuardianNodes start at block ${block}`))
	const blockDetail = await provideCONET.getBlock(block)
	const transactions = blockDetail?.transactions
	if (!transactions) {
		return
	}
	//@ts-ignore
	await mapLimit(transactions, 1, async (n, next) => {
		await detailTransfer(n)
	})
}

export const checkGasPrice = 25000000
let startDailyPoolTranferProcess = false
let lastTransferTimeStamp = new Date().getTime()
const longestWaitingTimeForDaily = 1000 * 60 * 10
const longestWaitingTimeForTicket = 1000 * 60 * 5

const startDailyPoolTranfer = async () => {
	if (startDailyPoolTranferProcess || !dailyClickPool.size) {
		return
	}
	startDailyPoolTranferProcess = true
	const feeData = await provideCONET.getFeeData()
	const gasPrice = feeData.gasPrice ? parseFloat(feeData.gasPrice.toString()): checkGasPrice + 1

	const timeStamp = new Date().getTime()

	if ( gasPrice > checkGasPrice || !gasPrice ) {
		if (timeStamp - lastTransferTimeStamp < longestWaitingTimeForDaily) {
			startDailyPoolTranferProcess = false
			logger(Colors.grey(`startDailyPoolTranfer waiting low GAS fee! Pool size = ${dailyClickPool.size}`))
			return 
		}
	}
	const wallets: string[] = []
	dailyClickPool.forEach((v, key) => {
		wallets.push(key)
		dailyClickPool.delete(key)
	})

	try {
		const tx =  await dailyClickContract.batchDaliy(wallets)
		const ts = await tx.wait()
		logger(Colors.blue(`startDailyPoolTranfer success!`))
		logger(inspect(ts, false, 3, true))
		lastTransferTimeStamp = timeStamp
	} catch (ex: any) {
		logger(Colors.red(`dailyClickContract.batchDaliy got Error! return wallets to pool!`), ex.message)
		logger(JSON.stringify(wallets))
		startDailyPoolTranferProcess = false
		return wallets.forEach(n => dailyClickPool.set(n, true))
	}
	
}

const startListeningCONET_Holesky_EPOCH = async () => {
	checkLotteryHasBalance()
	getAllOwnershipOfGuardianNodes()
	provideCONET.on ('block', async block => {
		listeningGuardianNodes (block)
		checkLotteryHasBalance()
		startDailyPoolTranfer()
		dailyTaskPoolProcess()
	})
}


//			getIpAddressFromForwardHeader(req.header(''))
const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}

const addAttackToCluster = async (ipaddress: string) => {
	const option: RequestOptions = {
		hostname: 'apiv2.conet.network',
		path: `/api/ipaddress`,
		port: 4100,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	const postData = {
		ipaddress: ipaddress
	}

	const req = await request (option, res => {
		let data = ''
		res.on('data', _data => {
			data += _data
		})
		res.once('end', () => {
			logger(Colors.blue(`addAttackToCluster [${ipaddress}] success! data = [${data}]`))
		})
	})

	req.once('error', (e) => {
		logger(Colors.red(`addAttackToCluster r[${ipaddress}] equest on Error! ${e.message}`))
	})

	req.write(JSON.stringify(postData))
	req.end()
}


const guardianNodesList: string[] = []

let getAllOwnershipOfGuardianNodesProcessing = false

const getAllOwnershipOfGuardianNodes = async () => {
	if (getAllOwnershipOfGuardianNodesProcessing) {
		return logger(`getAllOwnershipOfGuardianNodes already process!`)
	}
	getAllOwnershipOfGuardianNodesProcessing = true
	const guardianSmartContract = new ethers.Contract(CGPNsAddr, CGPNsABI, provideCONET)
	let nodes
	try {
		nodes = await guardianSmartContract.getAllIdOwnershipAndBooster()
	} catch (ex: any) {
		getAllOwnershipOfGuardianNodesProcessing = false
		return logger(Colors.grey(`nodesAirdrop guardianSmartContract.getAllIdOwnershipAndBooster() Error! STOP `), ex.mesage)
	}
	const _nodesAddress: string[] = nodes[0].map((n: string) => n.toLowerCase())

	const NFTIds = _nodesAddress.map ((n, index) => 100 + index)

	let NFTAssets: number[]

	try {
		NFTAssets = await guardianSmartContract.balanceOfBatch(_nodesAddress, NFTIds)
	} catch (ex: any) {
		getAllOwnershipOfGuardianNodesProcessing = false
		return logger(Colors.red(`nodesAirdrop guardianSmartContract.balanceOfBatch() Error! STOP`), ex.mesage)
	}


	NFTAssets.forEach((n, index) => {
		if (n ) {
			guardianNodesList.push(_nodesAddress[index])
		}
	})
	
	logger(Colors.blue(`guardianNodesList length = [${guardianNodesList.length}]`))
	getAllOwnershipOfGuardianNodesProcessing = false
}


interface conetData {
	address: string
	balance?: any
	req: any
}

const etherNew_Init_Admin = new ethers.Wallet (masterSetup.conetFaucetAdmin[3], new ethers.JsonRpcProvider(conet_Holesky_rpc))
const sentData = async (data: conetData, callback: (err?: any, data?: ethers.TransactionResponse) => void) => {

	let tx
	try{
		const addr = ethers.getAddress(data.address)
		const ts = {
			to: addr,
			// Convert currency unit from ether to wei
			value: data.balance?.toString()
		}
		tx = await etherNew_Init_Admin.sendTransaction(ts)
	} catch (ex) {
		console.log(Colors.red(`${ethers.formatEther(data.balance||0)} CONET => [${data.address}] Error!`), ex)
		return callback(ex)
	}
	return callback (null, tx)
}

interface clientRequestTimeControl {
	lastTimestamp: number
	ipAddress: string
}

const LimitAccess = 50000
const doubleWinnerWaiting = 20 * 1000


const walletPool: Map<string, clientRequestTimeControl> = new Map()

const initWalletPool: Map<string, boolean> = new Map()
const _rand1 = 1
const _rand2 = _rand1 * 2
const _rand3 = _rand1 * 5
const _rand4 = _rand1 * 10

const MaximumBet= 1000

interface winnerObj {
	bet: number
	wallet: string
	ipAddress: string
	Daemon: NodeJS.Timeout|null
}


const LotteryWinnerPool: Map<string, winnerObj> = new Map()
let isHourlyBalance = false

const checkLotteryHasBalance = async () => {

	try {
		const _balance = await cntp_ticketManager_Contract.currentTime_CNTP_balance()
		const balace = parseInt(ethers.formatEther(_balance))
		logger(Colors.magenta(`checkLotteryHasBalance ${balace} `))
		if (balace > 0) {
			return isHourlyBalance = true
		}
		logger(Colors.magenta(`checkLotteryHasBalance has no balance! ${balace}`))
		isHourlyBalance = false
	} catch (ex) {
		
	}
	return false
}

const checkAddressDailyClick = async (addr: string) => {
	try {
		const today = await dailyClickContract.currentDay()
		const isCanClick = await dailyClickContract.daily_users(today, addr)
		logger(Colors.blue(`checkAddressDailyClick ${addr} daily click is ${isCanClick}!`))
		return isCanClick
	} catch (ex) {
		logger(Colors.red(`checkAddressDailyClick call dailyClickContract Contract got Error!`))
		return null
	}
}

const randomLotteryV3 = () => {
	
	if (!isHourlyBalance) {
		return {lotterRate: [_rand1, _rand2, _rand3, _rand4], lottery: 0} 
	}
	//			60% 
	const rand1 = Math.round(Math.random()*1.2) > 0

	const lotterRate = [_rand1, _rand2, _rand3, _rand4]

	if (rand1) {
		//		60% / 50% => 30%
		const rand2 = Math.round(Math.random()) > 0

		if (rand2)	{
			//		30% / 29% = 9%
			const rand3 = Math.round(Math.random()*.7) > 0
			if (rand3) {

				const rand4 = Math.round(Math.random()) > 0

				if (!rand4) {
					return {lotterRate, lottery: _rand3}
				}

				return {lotterRate, lottery: _rand4}
			}
			return {lotterRate, lottery: _rand2}
		}
		return {lotterRate,lottery: _rand1}
	}

	return {lotterRate: [_rand1, _rand2, _rand3, _rand4], lottery: 0} 
}

process.on('unhandledRejection', (reason) => { throw reason; })


const addToWinnerPool = (winnObj: winnerObj, CNTP_Transfer_manager: CNTP_TicketManager_class) => {
	logger(Colors.magenta(`[${winnObj.wallet}:${winnObj.ipAddress}] Win${winnObj.bet} added to LotteryWinnerPool`))
	
	const setT = setTimeout(() => {
		LotteryWinnerPool.delete (winnObj.wallet)
		CNTP_Transfer_manager.addToPool([winnObj.wallet], [winnObj.bet])
		logger(Colors.blue(`Move winner [${winnObj.wallet}:${winnObj.ipAddress}] Pay [${winnObj.bet}] to LotteryWinnerPool size = [${LotteryWinnerPool.size}]`))

	}, doubleWinnerWaiting)

	winnObj.Daemon = setT
	LotteryWinnerPool.set(winnObj.wallet, winnObj)
}

let startFaucetProcessStatus = false
const MAX_TX_Waiting = 1000 * 60 * 3

const startFaucetProcess = () => new Promise(async resolve => {
	if (!faucetWaitingPool.length || startFaucetProcessStatus) {
		return resolve (false)
	}

	startFaucetProcessStatus = true
	logger(`Start Faucet Process Wainging List length = ${faucetWaitingPool.length}`)

	logger(inspect(faucetWaitingPool, false, 3, true))
	const ipAddress = faucetWaitingPool.map(n => n.ipAddress)
	const wallet = faucetWaitingPool.map(n => n.wallet)
	logger(inspect(wallet, false, 3, true))

	try {
		
		const tx = await faucet_v3_Contract.getFaucet(wallet, ipAddress)
		logger(`start Faucet Process tx = ${tx.hash} wallet ${faucetWallet.address}`)
		const timeout= setTimeout(() => {
			logger(`startFaucetProcess waiting tx conform TIMEOUT error! return Faucet array`)
			startFaucetProcessStatus = false
			return resolve(false)
		}, MAX_TX_Waiting)

		const tx_conform = await tx.wait()

		clearTimeout(timeout)

		if (!tx_conform) {
			logger(`startFaucetProcess ${tx.hash} failed tx.wait() return NULL!`)
			startFaucetProcessStatus = false
			return resolve(false)
		}

		logger(`startFaucetProcess `)
		logger(inspect(tx_conform, false, 3, true))
		faucetWaitingPool = []

	} catch (ex) {
		logger(`startFaucetProcess Error!`, ex)

	}

	startFaucetProcessStatus = false
	return resolve(true)
})

const scAddr = '0x7859028f76f83B2d4d3af739367b5d5EEe4C7e33'.toLowerCase()
const sc = new ethers.Contract(scAddr, devplopABI, provideCONET)
const developWalletPool: Map<string, boolean> = new Map()

const getAllDevelopAddress = async () => {
	let ret: any []
	try {
		ret = await sc.getAllDevelopWallets()
		
	} catch (ex: any) {
		return logger(Colors.red(`getAllDevelopAddress call error!`), ex.message)
	}

	for (let i = 0; i < ret.length; i ++){
		logger(Colors.blue(`getAllDevelopAddress added ${(ret[i][0])} to developWalletPool`))
		developWalletPool.set (ret[i][0].toLowerCase(), ret[i][1])
	}
}


const developWalletListening = async (block: number) => {
	
	const blockTs = await provideCONET.getBlock(block)

	if (!blockTs?.transactions) {
        return 
    }

	for (let tx of blockTs.transactions) {

		const event = await provideCONET.getTransaction(tx)
		
		if ( event?.to?.toLowerCase() === scAddr) {
			await getAllDevelopAddress()
		}
		
	}
}

const stratlivenessV2 = async (eposh: number, classData: conet_dl_server) => {
	await Promise.all([
		ticketPoolProcess(eposh),
		startFaucetProcess(),
		developWalletListening(eposh)

	])
}

const doubleV3 = (wallet: string, ipAddress: string, CNYP_class: CNTP_TicketManager_class) => {
	const winner = LotteryWinnerPool.get (wallet)

	//				new Lottery game!
	if (!winner) {
		const obj = randomLotteryV3 ()
		if (obj.lottery > 0){
			addToWinnerPool ({
				ipAddress, wallet, bet: obj.lottery, Daemon: null
			}, CNYP_class)
			
		}
		return obj
	}

	logger(Colors.magenta(`[${winner.wallet}:${winner.ipAddress}] Win${winner.bet} START play Double`))

	if (winner.Daemon) {
		clearTimeout(winner.Daemon)
	}

	logger(Colors.magenta(`Double Game Start for [${wallet}] Bet = [${winner.bet}]`))

	if (winner.bet >= MaximumBet) {
		LotteryWinnerPool.delete (wallet)
		return {lottery: 0}
	}

	const rand1 = !(Math.floor(Math.random()*3))
	
	if (rand1) {
		winner.bet *= 2
		addToWinnerPool (winner, CNYP_class)
		logger(Colors.magenta(`[${winner.wallet}:${winner.ipAddress}] Winner ${winner.bet} WIN Double! `))
		return {lottery: winner.bet}
	}
	logger(Colors.magenta(`[${winner.wallet}:${winner.ipAddress}] ${winner.bet} Double GAME OVER!`))
	LotteryWinnerPool.delete (wallet)
	return {lottery: 0}
}

const soLotteryV3 = (wallet: string, ipaddress: string, res: Response, CNYP_class: CNTP_TicketManager_class) => {

	const obj = doubleV3 (wallet, ipaddress,CNYP_class)
	logger(Colors.magenta(`Start new randomLottery [${wallet}:${ipaddress}]`), inspect(obj, false, 3, true))
	return res.status(200).json(obj).end()
}

const checkTimeLimited = (wallet: string, ipaddress: string, res: Response, CNYP_class: CNTP_TicketManager_class) => {
	const lastAccess = walletPool.get(wallet)
	if (lastAccess) {
		return res.status(301).end()
	}
	soLotteryV3 (wallet, ipaddress, res, CNYP_class)
}

const faucetV3_new_Addr = `0x04CD419cb93FD4f70059cAeEe34f175459Ae1b6a`
const ticketAddr = '0x92a033A02fA92169046B91232195D0E82b8017AB'
const profileAddr = '0x9f2d92da19beA5B2aBc51e69841a2dD7077EAD8f'
const ticketManager_addr = '0x3Da23685785F721B87971ffF5D0b1A892CC1cd71'

const faucetWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[1], provideCONET)
const faucet_v3_Contract = new ethers.Contract(faucetV3_new_Addr, faucet_v3_ABI, faucetWallet)

const ticketWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[2], provideCONET)
const profileWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[3], provideCONET)
const profileContract = new ethers.Contract(profileAddr, profileABI, profileWallet)
export const ticket_contract = new ethers.Contract(ticketAddr, Ticket_ABI, ticketWallet)

const cntp_ticketManager_Contract = new ethers.Contract(ticketManager_addr, tickerManagerABi, provideCONET)

interface faucetRequest {
	wallet: string
	ipAddress: string
}


const ticketPool: Map<string, number> = new Map()
const ticketBrunPool: Map<string, number> = new Map()
const twitterNFTPool: Map<string, boolean> = new Map()
const dailyClickPool: Map<string, boolean> = new Map()


const ticket = (wallet: string, res: Response, ipAddress: string) => {
	logger(Colors.magenta(`ticket [${wallet}:${ipAddress}]`))
	const develop = developWalletPool.get (wallet)
	logger(Colors.magenta(`ticket developWalletPool.get develop = ${develop}`))
	logger(inspect(developWalletPool, false, 3, true))
	if (develop) {
		const _ticket = ( ticketPool.get (wallet) || 0 ) + 1
		ticketPool.set( wallet, _ticket )
		logger(Colors.magenta(`ticket for develop [${wallet}:${ipAddress}]`))
		return res.status(200).json({ticket:1}).end()
	}

	const rand = !(Math.floor(Math.random() * 4 ))

	if (!rand) {
		logger(Colors.magenta(`ticket [${wallet}:${ipAddress}] lose`))
		return res.status(200).json({}).end()
	}

	const _ticket = (ticketPool.get (wallet)||0) + 1
	ticketPool.set(wallet, _ticket)
	logger(Colors.magenta(`ticket [${wallet}:${ipAddress}] win 1 !`))
	res.status(200).json({ticket:1}).end()
}

let ticketPoolProcesing = false

const returnArrayToTicketPoolProcess = (wallet: string[], tickets: number[]) => {
	wallet.forEach((n, index) => {
		const ticket = (ticketPool.get (n)||0) + tickets[index]
		ticketPool.set(n, ticket)
	})
}

let lastticketTransferTimeStamp = new Date().getTime()

const ticketPoolProcess = async (block: number) => {
	if (ticketPoolProcesing || !ticketPool.size){
		return
	}
	ticketPoolProcesing = true
	const feeData = await provideCONET.getFeeData()
	const gasPrice = feeData.gasPrice ? parseFloat(feeData.gasPrice.toString()): checkGasPrice + 1

	const timeStamp = new Date().getTime()

	if ( gasPrice > checkGasPrice || !gasPrice ) {
		if (timeStamp - lastticketTransferTimeStamp < longestWaitingTimeForTicket) {
			ticketPoolProcesing = false
			logger(Colors.grey(`ticketPoolProcess waiting low GAS fee! Pool size = ${ticketPool.size}`))
			return 
		}
	}

	const wallet: string[] = []
	const tickets: number[] = []
	const walletBrun: string[] = []
	const brunNumber: number[] = []
	const twitter: string [] = []
	ticketPool.forEach((v, key) => {
		if (v > 0) {
			wallet.push(key)
			tickets.push(v)
		}
		ticketPool.set(key, 0)
	})

	ticketBrunPool.forEach((v, key) => {
		if (v > 0) {
			walletBrun.push(key)
			brunNumber.push(v)
		}
		ticketBrunPool.set(key, 0)
	})

	twitterNFTPool.forEach((v, key) => {
		twitter.push(key)
	})


	const ids: number[] = wallet.map(n => 1)
	const ids1: number[] = walletBrun.map(n => 1)
	const idTw: number [] = twitter.map(n => 2)
	const totalTw: number[] = twitter.map(n => 1)

	const mintWallets = [...wallet, ...twitter]
	const mintIds = [...ids, ...idTw]
	const mintTotal = [...tickets, ...totalTw]
	logger(Colors.magenta(`ticketPoolProcess started totla wallets [${wallet.length}]`))
	try {
		if (mintWallets.length) {
			const tx = await ticket_contract.mintBatch(mintWallets, mintIds, mintTotal)
			const tr = await tx.wait()
			logger(Colors.magenta(`ticketPoolProcess mintBatch success!`))
			logger(inspect(tr, false, 3, true))
		}
		if (walletBrun.length) {
			const tx = await ticket_contract.BurnBatch(walletBrun, ids1, brunNumber)
			const tr = await tx.wait()
			logger(Colors.magenta(`ticketPoolProcess mintBatch success!`))
			logger(inspect(tr, false, 3, true))
		}
		
	} catch (ex) {
		logger(`ticketPoolProcess call ticket_contract.mintBatch Error! return all wallet [${wallet.length}] to Pool`)
		ticketPoolProcesing = false
		logger(ex)
		logger(inspect(walletBrun, false, 3, true))
		logger(inspect(ids1, false, 3, true))
		logger(inspect(brunNumber, false, 3, true))
		return returnArrayToTicketPoolProcess (wallet, tickets)
	}
	ticketPoolProcesing = false
	lastticketTransferTimeStamp = timeStamp
}


export const checkGasPriceFordailyTaskPool = 25000000


const dailyTaskPool: Map<string, string> = new Map()
let dailyTaskPoolProcessLocked = false
const dailyTaskPoolProcess = async () => {
	if (dailyTaskPoolProcessLocked || !dailyTaskPool.size) {
		return
	}
	dailyTaskPoolProcessLocked = true

	const feeData = await provideCONET.getFeeData()
	const gasPrice = feeData.gasPrice ? parseFloat(feeData.gasPrice.toString()): checkGasPrice + 1

	const timeStamp = new Date().getTime()

	if ( gasPrice > checkGasPriceFordailyTaskPool || !gasPrice ) {
		if (timeStamp - lastticketTransferTimeStamp < longestWaitingTimeForTicket) {
			ticketPoolProcesing = false
			logger(Colors.grey(`ticketPoolProcess waiting low GAS fee! Pool size = ${ticketPool.size}`))
			dailyTaskPoolProcessLocked = false
			return 
		}
	}

	const wallet: string[] = []
	const ipAddress: string[] = []
	dailyTaskPool.forEach((v,k) => {
		wallet.push(k)
		ipAddress.push(v)
	})

	try{
		const tx = await dailyTaskSC.batchDaliy(wallet, ipAddress)
		const ts = await tx.wait()
		logger(Colors.blue(`dailyTaskPoolProcess send address length ${wallet.length} dailyTaskSC.batchDaliy success!`))
		logger(inspect(ts, false, 3, true))

	} catch (ex: any) {
		logger(Colors.red(`dailyTaskPoolProcess dailyTaskSC.batchDaliy Error! ${ex.message} return all data ${wallet.length} to Pool!`))
		wallet.forEach((n, index) => {
			dailyTaskPool.set(n,ipAddress[index])
		})

	}
	dailyTaskPoolProcessLocked = false

}



let faucetWaitingPool: faucetRequest[] = []
export const faucet_call =  (wallet: string, ipAddress: string) => {
	try {
		let _wallet = ethers.getAddress(wallet).toLowerCase()
		const obj = faucet_call_pool.get(_wallet)
		if (obj) {
			return false
		}
		faucet_call_pool.set(wallet, true)
		faucetWaitingPool.push({wallet, ipAddress})
		
	} catch (ex) {
		return false
	}

	return true
}

let block = 0

const faucet_call_pool: Map<string, boolean> = new Map()
const TwttterServiceListeningPool: Map<string, Response> = new Map()
const TGListeningPool: Map<string, Response> = new Map()
const TGWaitingCallbackPool: Map<string, (obk: minerObj) => void> = new Map()
const twitterWaitingCallbackPool: Map<string, (obk: minerObj) => void> = new Map()
const twitterNFTNumber = 2
const TGNFTNumber = 3

const callTGCheck: (obj: minerObj) => Promise<twitterResult> =  (obj) => new Promise( async resolve => {
	let ret: twitterResult = {
		status: 200
	}

	const twitterAccount = obj.data[0].toUpperCase()
	let SocialNFT: number[] = []
	try {
		const [tx, SocialArray] = await Promise.all ([
			profileContract.checkSocialNFT(TGNFTNumber, twitterAccount),
			profileContract.getSocialUser(obj.walletAddress)
		])
		
		if (tx) {
			ret.status = 402
			ret.isusedByOtherWallet = true
			ret.message = 'This Telegram Account was registered by someone already.'
			return resolve (ret)
		}

		if (SocialArray?.length) {
			SocialNFT = SocialArray[0].map((n: BigInt) => parseInt(n.toString()))
			const jj = SocialNFT.findIndex(n => n === TGNFTNumber)
			if (jj > -1) {
				ret.status = 403
				ret.message = 'Your Telegram are registered already.'
				return resolve (ret)
			}
		}
		
	} catch (ex) {
		ret.status = 501
		ret.message = 'Service Unavailable!'
		return resolve (ret)
	}


	if (!TGListeningPool.size) {
		ret.status = 502
		ret.message = 'Telegram Bot Service Unavailable!'
		return resolve (ret)
	}

	obj.uuid = v4()
	const post = JSON.stringify(obj) + '\r\n\r\n'

	const waitCallBack = async (_obj: minerObj) => {
		logger(`TG wait CallBack return`)
		logger(inspect(_obj, false, 3, true))

		const result = _obj.result
		if (!result) {
			ret.status = 500
			ret.message = 'Telegram Bot Service Unavailable!'
			return resolve (ret)
		}
		
		ret = result
		if (ret.status !== 200 || !ret.isInTGGroup ) {
			return resolve (ret)
		}

		//twitterNFTPool.set(obj.walletAddress, true)
		await profileContract.updateSocial(TGNFTNumber, twitterAccount, obj.walletAddress)
		ret.NFT_ID = TGNFTNumber
		if (SocialNFT.length > 0) {
			const _ticket = (ticketPool.get (obj.walletAddress)||0) + 1
			ticketPool.set(obj.walletAddress, _ticket)
		}
		
		return resolve (ret)
	}

	TGWaitingCallbackPool.set (obj.uuid, waitCallBack)

	TGListeningPool.forEach((n, key) => {

		if (n.writable) {
			return n.write(post, err => {
				if (err) {
					TGListeningPool.delete(key)
					return logger(Colors.red(`TG Pool POST to ${key} got write Error ${err.message} remove ${key} from listening POOL!`))
				}

				return logger(Colors.red(`TG Pool POST ${inspect(obj, false, 3, true)} to ${key} success!`))
			})
		}

		TGListeningPool.delete(key)
		return logger(Colors.red(`TG Pool ${key} got writeable = false Error remove ${key} from listening POOL!`))
	})

})

const callSocialTaskTaskCheck: (obj: minerObj) => Promise<twitterResult> =  (obj) => new Promise( async resolve => {
	const socialTaskText = obj.walletAddress
	const socialTaskNFTNumber = parseInt(obj.data[0])

	let ret: twitterResult = {
		status: 200
	}

	if( isNaN(socialTaskNFTNumber) || socialTaskNFTNumber < 4 || socialTaskNFTNumber > 5 ) {
		ret.status = 404
		ret.message = 'Unknow social Task number!'
		return resolve (ret)
	}

	try {
		const [tx, SocialArray] = await Promise.all ([
			profileContract.checkSocialNFT(socialTaskNFTNumber, socialTaskText),
			profileContract.getSocialUser(obj.walletAddress)
		])
		
		if (tx) {
			ret.status = 402
			ret.isusedByOtherWallet = true
			ret.message = 'Your social task was completed.'
			return resolve (ret)
		}

		let SocialNFT: number[] = []
		if (SocialArray?.length) {
			SocialNFT = SocialArray[0].map((n: BigInt) => parseInt(n.toString()))
			const jj = SocialNFT.findIndex(n => n === socialTaskNFTNumber)
			if (jj > -1) {
				ret.status = 403
				ret.message = 'Your social task was completed.'
				return resolve (ret)
			}
		}
		
	} catch (ex) {
		ret.status = 501
		ret.message = 'Service Unavailable!'
		return resolve (ret)
	}

	await profileContract.updateSocial(socialTaskNFTNumber, socialTaskText, obj.walletAddress)
		ret.NFT_ID = socialTaskNFTNumber
		
		const _ticket = (ticketPool.get (obj.walletAddress)||0) + 1
		ticketPool.set(obj.walletAddress, _ticket)
		
	return resolve (ret)
})

const callTwitterCheck: (obj: minerObj) => Promise<twitterResult> =  (obj) => new Promise( async resolve => {
	let ret: twitterResult = {
		status: 200
	}

	const twitterAccount = obj.data[0].toUpperCase()
	let SocialNFT: number[] = []

	try {
		const [tx, SocialArray] = await Promise.all ([
			profileContract.checkSocialNFT(twitterNFTNumber, twitterAccount),
			profileContract.getSocialUser(obj.walletAddress)
		])
		
		if (tx) {
			ret.status = 402
			ret.isusedByOtherWallet = true
			ret.message = 'This Twitter Account was registered by someone already.'
			return resolve (ret)
		}

		if (SocialArray?.length) {
			SocialNFT = SocialArray[0].map((n: BigInt) => parseInt(n.toString()))
			const jj = SocialNFT.findIndex(n => n === twitterNFTNumber)
			if (jj > -1) {
				ret.status = 403
				ret.message = 'Your Twitter are registered already.'
				return resolve (ret)
			}

		}
		

	} catch (ex) {
		ret.status = 501
		ret.message = 'Service Unavailable!'
		return resolve (ret)
	}


	if (!TwttterServiceListeningPool.size) {
		ret.status = 502
		ret.message = 'Twitter Service Unavailable!'
		return resolve (ret)
	}

	obj.uuid = v4()
	const post = JSON.stringify(obj) + '\r\n\r\n'

	const waitCallBack = async (_obj: minerObj) => {
		logger(`waitCallBack return`)
		logger(inspect(_obj, false, 3, true))
		const result = _obj.result
		if (!result) {
			ret.message = 'Twitter Service Unavailable!'
			ret.status = 503
			return resolve (ret)
		}
		
		ret = result
		if (ret.status !== 200 || !ret.isFollow || !ret.isRetweet ) {
			return resolve (ret)
		}

		//twitterNFTPool.set(obj.walletAddress, true)
		await profileContract.updateSocial(twitterNFTNumber, twitterAccount, obj.walletAddress)
		ret.NFT_ID = twitterNFTNumber
		if (SocialNFT.length > 0) {
			const _ticket = (ticketPool.get (obj.walletAddress)||0) + 1
			ticketPool.set(obj.walletAddress, _ticket)
		}
		return resolve (ret)
	}

	twitterWaitingCallbackPool.set (obj.uuid, waitCallBack)

	TwttterServiceListeningPool.forEach((n, key) => {

		if (n.writable) {
			return n.write(post, err => {
				if (err) {
					TwttterServiceListeningPool.delete(key)
					return logger(Colors.red(`TwttterServiceListeningPool POST to ${key} got write Error ${err.message} remove ${key} from listening POOL!`))
				}

				return logger(Colors.red(`TwttterServiceListeningPool POST ${inspect(obj, false, 3, true)} to ${key} success!`))
			})
		}

		TwttterServiceListeningPool.delete(key)
		return logger(Colors.red(`TwttterServiceListeningPool ${key} got writeable = false Error remove ${key} from listening POOL!`))
	})

})

class conet_dl_server {

	private PORT = 8002
	private serverID = ''

	public CNTP_manager = new CNTP_TicketManager_class ([masterSetup.gameCNTPAdmin[0]], 1000)

	private initSetupData = async () => {
        logger (Colors.blue(`start local server!`))
		this.serverID = getServerIPV4Address(false)[0]
		logger(Colors.blue(`serverID = [${this.serverID}]`))
		block = await provideCONET.getBlockNumber()
		logger(`conet_dl_server STARTED BLOCK`)
		
		provideCONET.on ('block', async _block => {
			if (_block === block + 1 ) {
				block++
				return stratlivenessV2(_block, this)
			}
		})
		await getAllDevelopAddress()
		this.startServer()
	}

	constructor () {
		this.initSetupData ()
		startListeningCONET_Holesky_EPOCH()
    }

	private startServer = async () => {
		
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use(Cors ())
		app.use(Express.json())

		app.use( '/api', router )

		app.once ( 'error', ( err: any ) => {
			/**
			 * https://stackoverflow.com/questions/60372618/nodejs-listen-eacces-permission-denied-0-0-0-080
			 * > sudo apt-get install libcap2-bin 
			 * > sudo setcap cap_net_bind_service=+ep `readlink -f \`which node\``
			 * 
			 */
            logger (err)
            logger (Colors.red(`Local server on ERROR`))
        })

		const server = createServer(app)

		this.router (router)

		app.all ('*', (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.red(`Cluster Master get unknow router from ${ipaddress} => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end ()
			return res.socket?.end().destroy()
		})

		logger(`start master server!`)

		server.listen(this.PORT, '127.0.0.1', () => {
			startEposhTransfer()
			return console.table([
                { 'CoNET DL': `version ${version} startup success ${ this.PORT } Work [${workerNumber}] server key [${cntpAdminWallet.address}]` }
            ])
		})
		
		
	}

	private router ( router: Router ) {

		//********************			V2    		****** */				
		router.post ('/conet-faucet', async (req, res ) => {
			const wallet = req.body.walletAddress
			const ipaddress = req.body.ipaddress
			if (!wallet) {
				logger(Colors.red(`master conet-faucet req.walletAddress is none Error! [${wallet}]`))
				return res.status(403).end()
			}

			const tx = await faucet_call(wallet.toLowerCase(), ipaddress)
			if (tx) {
				return res.status(200).json(tx).end()
			}

			return res.status(403).end()

		})

		router.post ('/claimToken', async ( req, res ) => {

			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}
			return res.status(403).end()
			const response = await claimeToekn (message, signMessage)
			if (response) {
				return res.status(200).json({}).end()
			}
			return res.status(403).end()

		})

		router.post ('/ticket', async ( req, res ) => {
			logger(Colors.blue(`Cluster Master got: /ticket`))
			const wallet = req.body.obj.walletAddress
			return ticket(wallet, res, req.body.obj.ipAddress)
		})

		router.post ('/ticket-lottery', async ( req, res ) => {
			logger(Colors.blue(`Cluster Master got: /ticket-lottery`))
			const wallet = req.body.obj.walletAddress
			const ipaddress = req.body.obj.ipAddress
			const brun = ticketBrunPool.get (wallet)||0
			try {
				const balance = await ticket_contract.balanceOf(wallet, 1)
				if (brun + 1 > parseInt(balance)) {
					return res.status(301).end()
				}
			} catch (ex) {
				
				return res.status(301).end()
				
			}
			
			ticketBrunPool.set (wallet, brun + 1)

			return checkTimeLimited(wallet, ipaddress, res, this.CNTP_manager)
		})

		// router.post ('/lottery', async ( req, res ) => {
		// 	logger(Colors.blue(`Cluster Master got: /lottery`))
		// 	logger(inspect(req.body, false, 3, true))
		// 	const wallet = req.body.obj.walletAddress
		// 	const ipaddress = req.body.obj.ipAddress
		// 	return checkTimeLimited(wallet, ipaddress, res, this.CNTP_manager)
		// })

		router.post ('/initV3',  async (req, res) => {
			const wallet: string = req.body.wallet
			logger(Colors.blue(`/initV3 ${wallet}`))
			await initNewCONET(wallet)
			res.status(200).json({}).end()
			
		})

		router.post ('/maining-update',  async (req, res) => {
			const obj:minerObj = req.body.obj
			logger(Colors.blue(`/maining-update`))
			logger(inspect(obj, false, 3, true))
			res.status(200).json({}).end()
			
		})

		router.post ('/twitter-listen',  async (req, res) => {
			const obj: minerObj = req.body.obj

			logger(Colors.blue(`/twitter-listen`))
			logger(inspect(obj, false, 3, true))
			
			res.status(200)
			res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Connection', 'keep-alive')
            res.flushHeaders() // flush the headers to establish SSE with client
			const returnData = {status: 200}
			res.write( JSON.stringify (returnData) + '\r\n\r\n')

			res.once('error', err => {
				TwttterServiceListeningPool.delete(obj.walletAddress)
				return logger(Colors.red(`TwttterPool ${obj.walletAddress} res.on ERROR ${err.message} delete from pool!`))
			})
			
			res.once('end', () => {
				TwttterServiceListeningPool.delete(obj.walletAddress)
				return logger(Colors.red(`TwttterPool ${obj.walletAddress} res.on END! delete from pool!`))
			})

			TwttterServiceListeningPool.set(obj.walletAddress, res)

			return logger(Colors.magenta(`/twitter-listen added ${obj.walletAddress} to TwttterServiceListeningPool ${TwttterServiceListeningPool.size}`))
		})

		router.post ('/tg-listen',  async (req, res) => {
			const obj: minerObj = req.body.obj

			logger(Colors.blue(`/tg-listen`))
			logger(inspect(obj, false, 3, true))
			
			res.status(200)
			res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Connection', 'keep-alive')
            res.flushHeaders() // flush the headers to establish SSE with client
			const returnData = {status: 200}
			res.write( JSON.stringify (returnData) + '\r\n\r\n')

			res.once('error', err => {
				TGListeningPool.delete(obj.walletAddress)
				return logger(Colors.red(`TGPool ${obj.walletAddress} res.on ERROR ${err.message} delete from pool!`))
			})
			
			res.once('end', () => {
				TGListeningPool.delete(obj.walletAddress)
				return logger(Colors.red(`TwttterPool ${obj.walletAddress} res.on END! delete from pool!`))
			})

			TGListeningPool.set(obj.walletAddress, res)

			return logger(Colors.magenta(`/tg added ${obj.walletAddress} to TwttterServiceListeningPool ${TwttterServiceListeningPool.size}`))
		})

		router.post ('/twitter-check-follow',  async (req, res) => {
			const obj: minerObj = req.body.obj
			logger(Colors.blue(`/twitter-check-follow`))
			logger(inspect(obj, false, 3, true))
			const result: twitterResult|null  = await callTwitterCheck (obj)
			if (!result ) {
				return res.status(500).end()
			}
			return res.status(200).json(result).end()
		})

		router.post ('/tg-check-follow',  async (req, res) => {
			const obj: minerObj = req.body.obj
			logger(Colors.blue(`/tg-check-follow`))
			logger(inspect(obj, false, 3, true))
			const result: twitterResult|null  = await callTGCheck (obj)
			if (!result ) {
				return res.status(500).end()
			}
			return res.status(200).json(result).end()
		})

		router.post ('/socialTask',  async (req, res) => {
			const obj: minerObj = req.body.obj
			logger(Colors.blue(`/socialTask`))
			logger(inspect(obj, false, 3, true))
			const result: twitterResult|null  = await callSocialTaskTaskCheck (obj)
			if (!result ) {
				return res.status(500).end()
			}
			return res.status(200).json(result).end()
		})
		
		router.post ('/twitter-callback',  async (req, res) => {
			const obj: minerObj = req.body.obj
			logger(Colors.blue(`/twitter-callback`))
			logger(inspect(obj, false, 3, true))
			res.status(200).json({}).end()
			if (!obj|| !obj.data) {
				logger(inspect(obj, false, 3, true))
				return logger(Colors.red(`/twitter-callback got obj format Error`))
			}
			const _obj: minerObj = obj.data

			if (!_obj||!_obj.uuid ) {

				return logger(Colors.red(`/twitter-callback got obj data format Error`))
			}

			const callback = twitterWaitingCallbackPool.get(_obj.uuid)

			if (!callback) {
				return logger(Colors.red(`/twitter-callback has no ${obj.uuid} RES from twitterWaitingCallbackPool ${twitterWaitingCallbackPool.size} !`))
			}

			twitterWaitingCallbackPool.delete(_obj.uuid)
			
			callback(_obj)

			logger(Colors.magenta(`/twitter-callback return ${inspect(obj.data, false, 3, true)} success!`))
		})

		router.post ('/tg-callback',  async (req, res) => {
			const obj: minerObj = req.body.obj
			logger(Colors.blue(`/tg-callback`))
			logger(inspect(obj, false, 3, true))
			res.status(200).json({}).end()
			if (!obj|| !obj.data) {
				logger(inspect(obj, false, 3, true))
				return logger(Colors.red(`/tg-callback got obj format Error`))
			}
			const _obj: minerObj = obj.data

			if (!_obj||!_obj.uuid ) {

				return logger(Colors.red(`/tg-callback got obj data format Error`))
			}

			const callback = TGWaitingCallbackPool.get(_obj.uuid)

			if (!callback) {
				return logger(Colors.red(`/tg-callback has no ${obj.uuid} RES from TGCallbackPool ${TGWaitingCallbackPool.size} !`))
			}

			TGWaitingCallbackPool.delete(_obj.uuid)
			
			callback(_obj)

			logger(Colors.magenta(`/tg-callback return ${inspect(obj.data, false, 3, true)} success!`))
		})

		router.post ('/dailyClick',  async (req, res) => {
			const obj: minerObj = req.body.obj
			logger(Colors.blue(`/dailyClick`))

			const canClick = dailyClickPool.get(obj.walletAddress) || await checkAddressDailyClick(obj.walletAddress)
			if (canClick) {
				return res.status(401).json({}).end()
			}
			dailyClickPool.set(obj.walletAddress, true)
			return res.status(200).json({result: true}).end()
		})

		router.post ('/dailyTask',  async (req, res) => {
			const obj: minerObj = req.body.obj
			logger(Colors.blue(`/dailyTask`))
			logger(inspect(obj, false, 3, true))

			if (!obj.ipAddress) {
				return res.status(403).json({}).end()
			}
			
			dailyTaskPool.set(obj.walletAddress, obj.ipAddress )
			return res.status(200).json({result: true}).end()
		})

		router.all ('*', (req, res ) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

export default conet_dl_server