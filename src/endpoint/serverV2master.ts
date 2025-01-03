/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import Colors from 'colors/safe'
import Cluster from 'node:cluster'
import { masterSetup, getServerIPV4Address, conet_Holesky_rpc, sendCONET} from '../util/util'
import {logger} from '../util/logger'

import CGPNsABI from '../util/CGPNs.json'
import devplopABI from './develop.ABI.json'
import {ethers, FixedNumber} from 'ethers'
import type { RequestOptions } from 'node:http'
import {request} from 'node:http'
import {cntpAdminWallet, initNewCONET, startEposhTransfer} from './utilNew'
import {mapLimit} from 'async'
import faucetABI from './faucet_abi.json'
import faucet_v3_ABI from './faucet_v3.abi.json'
import Ticket_ABI from './ticket.abi.json'
import CNTP_Transfer_class  from '../util/CNTP_Transfer_pool'


const CGPNsAddr = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'.toLowerCase()
const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`

//	for production
	import {createServer} from 'node:http'
import { yarn } from 'global-dirs'

//	for debug
	// import {createServer as createServerForDebug} from 'node:http'

const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version
const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)




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



const startListeningCONET_Holesky_EPOCH = async () => {
	
	getAllOwnershipOfGuardianNodes()
	provideCONET.on ('block', async block => {
		listeningGuardianNodes (block)

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
	const guardianSmartContract = new ethers.Contract(CGPNsAddr, CGPNsABI,provideCONET)
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

const transCONETArray: conetData[] = []
let transCONETLock = false
let unlockCONETLock = false
const unlockArray: conetData[] = []


interface clientRequestTimeControl {
	lastTimestamp: number
	ipAddress: string
}

const LimitAccess = 50000
const doubleWinnerWaiting = 20 * 1000


const walletPool: Map<string, clientRequestTimeControl> = new Map()

const initWalletPool: Map<string, boolean> = new Map()
const _rand1 = 1
const _rand2 = _rand1 * 5
const _rand3 = _rand1 * 10
const _rand4 = _rand1 * 50
const _rand5 = _rand1 * 100

const MaximumBet= 1000

interface winnerObj {
	bet: number
	wallet: string
	ipAddress: string
	Daemon: NodeJS.Timeout|null
}


const LotteryWinnerPool: Map<string, winnerObj> = new Map()

const randomLottery = (test = false) => {
	
	const rand1 = !(Math.floor(Math.random()*1.5))

	if (rand1) {
		const rand2 = !(Math.floor(Math.random()*2))

		if (rand2)	{
			const rand3 = !(Math.floor(Math.random()*3))
			if (rand3) {
				if (!test) {
					return {lotterRate: [_rand1, _rand2, _rand3], lottery: _rand3}
				}
				const rand4 = !(Math.floor(Math.random()*4))
				if (!rand4) {
					return {lotterRate: [_rand1, _rand2, _rand3, _rand4, _rand5], lottery: _rand3}
				}
				const rand5 = !(Math.floor(Math.random()*5))
				if (rand5) {
					return {lotterRate: [_rand1, _rand2, _rand3, _rand4, _rand5], lottery: _rand5}
				}

				return {lotterRate: [_rand1, _rand2, _rand3, _rand4, _rand5], lottery: _rand4}
			}
			return test ? {lotterRate: [_rand1, _rand2, _rand3, _rand4, _rand5], lottery: _rand2} : {lotterRate: [_rand1, _rand2, _rand3], lottery: _rand2}
		}
		return test ? {lotterRate: [_rand1, _rand2, _rand3, _rand4, _rand5],lottery: _rand1} :  {lotterRate: [_rand1, _rand2, _rand3], lottery: _rand1}
	}
	return test ? {lotterRate: [_rand1, _rand2, _rand3, _rand4, _rand5], lottery: 0} : {lotterRate: [_rand1, _rand2, _rand3], lottery: 0}
}

process.on('unhandledRejection', (reason) => { throw reason; })


const addToWinnerPool = (winnObj: winnerObj, CNTP_Transfer_manager: CNTP_Transfer_class) => {
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
		developWalletPool.set (ret[i][0], ret[i][1])
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

const double = (wallet: string, ipAddress: string, CNYP_class: CNTP_Transfer_class, test = false) => {
	const winner = LotteryWinnerPool.get (wallet)

	if (!winner) {
		const obj = randomLottery (test)
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

const soLottery = (wallet: string, ipaddress: string, res: Response, CNYP_class: CNTP_Transfer_class, test = false) => {
	const obj = double (wallet, ipaddress,CNYP_class, test)
	logger(Colors.magenta(`Start new randomLottery [${wallet}:${ipaddress}]`), inspect(obj, false, 3, true))
	return res.status(200).json(obj).end()
}

const checkTimeLimited = (wallet: string, ipaddress: string, res: Response, CNYP_class: CNTP_Transfer_class, test = false) => {
	const lastAccess = walletPool.get(wallet)
	if (lastAccess) {
		return res.status(301).end()
	}
	soLottery (wallet, ipaddress, res, CNYP_class, test)
}

const faucetV3_new_Addr = `0x04CD419cb93FD4f70059cAeEe34f175459Ae1b6a`

const ticketAddr = '0x3933C2e84f7d90B60B00f9FeF8F640194C95A86c'
const faucetWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[1], provideCONET)
const faucet_v3_Contract = new ethers.Contract(faucetV3_new_Addr, faucet_v3_ABI, faucetWallet)

const ticketWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[2], provideCONET)
const ticket_contract = new ethers.Contract(ticketAddr, Ticket_ABI, ticketWallet)

interface faucetRequest {
	wallet: string
	ipAddress: string
}

const ticketPool: Map<string, number> = new Map()

const ticket = (wallet: string, res: Response, ipAddress: string) => {
	const develop = developWalletPool.get (wallet)

	if (develop) {
		const _ticket = ( ticketPool.get (wallet) || 0 ) + 1
		ticketPool.set( wallet, _ticket )
		return res.status(200).json({ticket:1}).end()
	}

	const rand = !(Math.floor(Math.random() * 4 ))

	if (rand) {
		return res.status(200).json({}).end()
	}

	const _ticket = (ticketPool.get (wallet)||0) + 1
	ticketPool.set(wallet, _ticket)
	res.status(200).json({ticket:1}).end()
}

let ticketPoolProcesing = false

const returnArrayToTicketPoolProcess = (wallet: string[], tickets: number[]) => {
	wallet.forEach((n, index) => {
		const ticket = (ticketPool.get (n)||0) + tickets[index]
		ticketPool.set(n, ticket)
	})
}

const ticketPoolProcess = async (block: number) => {
	if (ticketPoolProcesing || !ticketPool.size ){
		return
	}
	ticketPoolProcesing = true
	const wallet: string[] = []
	const tickets: number[] = []
	
	ticketPool.forEach((v,key) => {
		wallet.push(key)
		tickets.push(v)

		ticketPool.set(key, 0)
	})
	const ids: number[] = wallet.map(n => 1)

	logger(Colors.magenta(`ticketPoolProcess started totla wallets [${wallet.length}]`))
	try {
		const tx = await ticket_contract.mintBatch(wallet, ids, tickets)
		const tr = await tx.wait()
		logger(Colors.magenta(`ticketPoolProcess success!`))
		logger(inspect(tr, false, 3, true))
	} catch (ex) {
		logger(`ticketPoolProcess call ticket_contract.mintBatch Error! return all wallet [${wallet.length}] to Pool`)
		return returnArrayToTicketPoolProcess (wallet, tickets)
	}

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

const faucet_call_pool:Map<string, boolean> = new Map()

class conet_dl_server {

	private PORT = 8002
	private serverID = ''

	public CNTP_manager = new CNTP_Transfer_class ([masterSetup.gameCNTPAdmin[0]], 1000)

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

		app.all ('*', (req: any, res: any) => {
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
		router.post ('/conet-faucet', async (req: any, res: any) => {
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


		router.post ('/ticket', async (req: any, res: any) => {
			logger(Colors.blue(`Cluster Master got: /ticket`))
			const wallet = req.body.obj.walletAddress
			ticket(wallet, res, req.body.obj.ipAddress)
		})

		router.post ('/lottery', async (req: any, res: any) => {
			logger(Colors.blue(`Cluster Master got: /lottery`))
			logger(inspect(req.body, false, 3, true))
			const wallet = req.body.obj.walletAddress
			const ipaddress = req.body.obj.ipAddress
			checkTimeLimited(wallet, ipaddress, res, this.CNTP_manager)
		})

		router.post ('/lottery-ticket', async (req: any, res: any) => {
			res.status(200).json({}).end()
		
		})


		router.post ('/lottery_test', async (req: any, res: any) => {
			return res.status(403).end()
			// logger(Colors.blue(`Cluster Master got: /lottery_test`))
			// logger(inspect(req.body, false, 3, true))
			// const wallet = req.body.obj.walletAddress
			// const ipaddress = req.body.obj.ipAddress
			// return checkTimeLimited(wallet, ipaddress, res, this.CNTP_manager, true)
		})

		router.post ('/initV3',  async (req: any, res: any) => {
			const wallet: string = req.body.wallet
			logger(Colors.blue(`/initV3 ${wallet}`))
			await initNewCONET(wallet)
			res.status(200).json({}).end()
			
		})

		

		router.all ('*', (req: any, res: any) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

export default conet_dl_server


getAllDevelopAddress()