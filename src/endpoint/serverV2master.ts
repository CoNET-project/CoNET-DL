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
import { newCNTP_Contract, masterSetup, getServerIPV4Address, conet_Holesky_rpc, sendCONET} from '../util/util'
import {logger} from '../util/logger'
import {transferCCNTP} from '../util/transferManager'

import CGPNsABI from '../util/CGPNs.json'
import CNTPAbi from '../util/cCNTP.json'
import {ethers} from 'ethers'
import type { RequestOptions } from 'node:http'
import {request} from 'node:http'
import {cntpAdminWallet, initNewCONET, startEposhTransfer} from './utilNew'
import {mapLimit} from 'async'
import faucetABI from './faucet_abi.json'

const CGPNsAddr = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'.toLowerCase()
const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`

//	for production
	import {createServer} from 'node:http'

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
 
const _unlockCNTP = async (wallet: string, privateKey: string, CallBack: (err?: any, data?: ethers.TransactionResponse) => void) => {
	const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const walletObj = new ethers.Wallet(privateKey, provider)
	const cCNTPContract = new ethers.Contract(newCNTP_Contract, CNTPAbi, walletObj)
	let tx
	try {
		tx = await cCNTPContract.changeAddressInWhitelist(wallet, true)
	} catch (ex: any) {
		logger(Colors.red(`unlockCNTP error! ${ex.message}`))
		return CallBack (ex.message)
	}

	logger(Colors.gray(`unlockCNTP [${wallet}] success! tx = ${tx.hash}`) )
	return CallBack (null, tx)
}

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

const unlockCNTP = (address: string, req: Response) => {
	logger(Colors.blue(`unlockCNTP [${address}]`))
	unlockArray.push ({
		address, req
	})
	
	const unlock: any = async () => {
		if (unlockCONETLock) {
			return
		}
		const data = unlockArray.shift()
		if (!data) {
			unlockCONETLock = false
			return
		}
		unlockCONETLock = true
		return _unlockCNTP(data.address, masterSetup.claimableAdmin, (err, tx) => {
			unlockCONETLock = false
			if (err) {
				unlockArray.unshift(data)
				return unlock ()
			}
			if (req.writable && !req.writableEnded) {
				req.status(200).json({tx}).end()
			}
			
			return unlock ()
		})
	}

	if (unlockArray.length) {
		unlock()
	}
	
}

const transCONET = (address: string, balance: BigInt, req: Response) => {
	transCONETArray.push ({
		address, balance, req
	})
	
	const trySent: any = async () => {
		if (transCONETLock) {
			return
		}
		transCONETLock = true
		const data = transCONETArray.shift()

		if (!data) {
			transCONETLock = false
			return
		}
		

		return sentData(data, (err, tx) => {
			transCONETLock = false
			if (err) {
				return req.status(404).end()
			}
			if (req.writable && !req.writableEnded) {
				req.status(200).json({tx}).end()
			}
			
			return trySent ()
		})
	}

	if (transCONETArray.length) {
		trySent()
	}
	
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

const transferPool: Map<string, number> = new Map()
const LotteryWinnerPool: Map<string, winnerObj> = new Map()

const randomLottery = (test = false) => {
	
	const rand1 = !(Math.floor(Math.random()))

	if (rand1) {
		const rand2 = !(Math.floor(Math.random()*2))

		if (rand2)	{
			const rand3 = !(Math.floor(Math.random()*2))
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

const addToWinnerPool = (winnObj: winnerObj) => {
	logger(Colors.magenta(`[${winnObj.wallet}:${winnObj.ipAddress}] Win${winnObj.bet} added to LotteryWinnerPool`))
	
	
	const setT = setTimeout(() => {
		LotteryWinnerPool.delete (winnObj.wallet)
		const send = transferPool.get(winnObj.wallet)||0
		transferPool.set(winnObj.wallet, send + winnObj.bet)
		logger(Colors.blue(`Move winner [${winnObj.wallet}:${winnObj.ipAddress}] Pay [${send + winnObj.bet}] to LotteryWinnerPool size = [${LotteryWinnerPool.size}]`))
	}, doubleWinnerWaiting)

	winnObj.Daemon = setT
	LotteryWinnerPool.set(winnObj.wallet, winnObj)
}

const stratlivenessV2 = (eposh: number, classData: conet_dl_server) => {
	if (transferPool.size === 0) {
		return logger(Colors.grey(`stratlivenessV2 eposh = [${eposh}] transferPool has zero STOP!`))
	}
	const wallets: string[] = []
	const pay: string[] = []

	transferPool.forEach((v, key) => {
		wallets.push(key)
		pay.push(v.toFixed(10))
		transferPool.delete(key)
	})

	let iii = 0
	transferCCNTP(masterSetup.newFaucetAdmin[5], wallets, pay, err => {
		mapLimit(wallets, 1, async (n, next) => {
			await conet_lotte_new (n, parseInt(pay[iii]))
			iii ++
		}, err => {
			logger(err)
		})

	})
}

const double = (wallet: string, ipAddress: string, test = false) => {
	const winner = LotteryWinnerPool.get (wallet)

	if (!winner) {
		const obj = randomLottery (test)
		if (obj.lottery > 0){
			addToWinnerPool ({
				ipAddress, wallet, bet: obj.lottery, Daemon: null
			})
			
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
		addToWinnerPool (winner)
		logger(Colors.magenta(`[${winner.wallet}:${winner.ipAddress}] Winner ${winner.bet} WIN Double! `))
		return {lottery: winner.bet}
	}
	logger(Colors.magenta(`[${winner.wallet}:${winner.ipAddress}] ${winner.bet} Double GAME OVER!`))
	LotteryWinnerPool.delete (wallet)
	return {lottery: 0}
}

const soLottery = (wallet: string, ipaddress: string, res: Response, test = false) => {
	const obj = double (wallet, ipaddress, test)
	logger(Colors.magenta(`Start new randomLottery [${wallet}:${ipaddress}]`), inspect(obj, false, 3, true))
	return res.status(200).json(obj).end()

}

const checkTimeLimited = (wallet: string, ipaddress: string, res: Response, test = false) => {
	const lastAccess = walletPool.get(wallet)
	if (lastAccess) {
		return res.status(301).end()
	}
	soLottery (wallet, ipaddress, res, test)
}
const faucetAddr = `0x9E70d462c434ca3f5aE567E9a406C08B2e25c066`
const faucetWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[4], provideCONET)
const faucetContract = new ethers.Contract(faucetAddr, faucetABI, faucetWallet)
export const faucet_call =  (wallet: string, IPaddress: string) => new Promise(async resolve => {
	const obj = faucet_call_pool.get(wallet)
	if (obj) {
		return resolve (false)
	}

	try {
		let _wallet = ethers.getAddress(wallet)
		const gas = await faucetContract.getFaucet.estimateGas(_wallet, IPaddress)
		const tx = await faucetContract.getFaucet(wallet, IPaddress)
		logger(`faucet_call [${wallet}:${IPaddress}] Susess! ${inspect(tx, false, 1, true)}`)
		faucet_call_pool.set(wallet, true)
		return resolve (tx)
	} catch (ex){
		faucet_call_pool.set(wallet, true)
		logger(`faucet_call [${wallet}:${IPaddress}] Error!`)
		return resolve (false)
	}
	
})

let block = 0

const faucet_call_pool:Map<string, boolean> = new Map()
class conet_dl_server {

	private PORT = 8002
	private serverID = ''
	private initSetupData = async () => {


        logger (Colors.blue(`start local server!`))
		this.serverID = getServerIPV4Address(false)[0]
		logger(Colors.blue(`serverID = [${this.serverID}]`))
		block = await provideCONET.getBlockNumber()
		logger(`conet_dl_server STARTED BLOCK`)

		provideCONET.on ('block', async _block => {
			// if (_block === block + 1 ) {
				block++
				return stratlivenessV2(_block, this)
			// }
			
		})

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

		router.post ('/lottery', async ( req, res ) => {
			logger(Colors.blue(`Cluster Master got: /lottery`))
			logger(inspect(req.body, false, 3, true))
			const wallet = req.body.obj.walletAddress
			const ipaddress = req.body.obj.ipAddress
			return checkTimeLimited(wallet, ipaddress, res)
		})

		router.post ('/lottery_test', async ( req, res ) => {
			logger(Colors.blue(`Cluster Master got: /lottery_test`))
			logger(inspect(req.body, false, 3, true))
			const wallet = req.body.obj.walletAddress
			const ipaddress = req.body.obj.ipAddress
			return checkTimeLimited(wallet, ipaddress, res, true)
		})

		router.post ('/initV3',  async (req, res) => {
			const wallet: string = req.body.wallet
			logger(Colors.blue(`/initV3 ${wallet}`))
			await initNewCONET(wallet)
			res.status(200).json({}).end()
			
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