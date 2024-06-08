/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import {regiestMiningNode} from './help-database'
import Colors from 'colors/safe'
import { homedir } from 'node:os'
import {v4} from 'uuid'
import Cluster from 'node:cluster'
import { logger, checkErc20Tx, checkValueOfGuardianPlan, checkTx, getAssetERC20Address, checkReferralsV2_OnCONET_Holesky, cCNTP_Contract, getWasabiFile,
	 CONET_guardian_Address,checkSignObj, getNetworkName, getCNTPMastersBalance, getServerIPV4Address, s3fsPasswd, storageWalletProfile, conet_Holesky_rpc, sendCONET
} from '../util/util'
import {transferPool, startTransfer} from '../util/transferManager'
import CGPNsABI from '../util/CGPNs.json'
import CNTPAbi from '../util/cCNTP.json'
import {ethers} from 'ethers'
import type { RequestOptions, get } from 'node:https'
import {request} from 'node:http'
import {cntpAdminWallet} from './util'
import { address, isPublic, isV4Format, isV6Format} from 'ip'
import {request as HttpsRequest} from 'node:https'
import {sign} from 'eth-crypto'


const testMinerCOnnecting = (res: Response, returnData: any, wallet: string, ipaddress: string, livenessListeningPool: Map <string, livenessListeningPoolObj>) => new Promise (resolve=> {
	returnData['wallet'] = wallet
	if (res.writable && !res.closed) {
		return res.write( JSON.stringify(returnData)+'\r\n\r\n', async err => {
			if (err) {
				deleteAMiner(ipaddress, wallet, livenessListeningPool)
				logger(Colors.grey (`stratliveness write Error! delete ${wallet}`))
				livenessListeningPool.delete(wallet)
			}
			return resolve (true)
		})
		
	}
	deleteAMiner(ipaddress, wallet, livenessListeningPool)
	livenessListeningPool.delete(wallet)
	logger(Colors.grey (`stratliveness write Error! delete ${wallet}`))
	return resolve (true)
})
const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`
let s3Pass: s3pass
//	for production
	import {createServer} from 'node:http'

//	for debug
	// import {createServer as createServerForDebug} from 'node:http'

const setup = join( homedir(),'.master.json' )
const masterSetup: ICoNET_DL_masterSetup = require ( setup )
const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version
const FaucetCount = '0.01'

let leaderboardData = {
	epoch: '',
	free_cntp: null,
	free_referrals: null,
	guardians_cntp: null, 
	guardians_referrals: null
}

interface rate_list {
	wallet: string
	cntpRate: string
	referrals: string
}
let free_referrals_rate_lists: rate_list[] = []

let guardians_referrals_rate_lists: rate_list[] = []

let minerRate = 0
let totalMiner = ''


export const selectLeaderboard: (block: number) => Promise<boolean> = (block) => new Promise(async resolve => {
	const [_node, _free] = await Promise.all([
		getWasabiFile(`${block}_node`),
		getWasabiFile(`${block}_free`)
	])
	if (!_node||!_free) {
		//logger(Colors.blue(`selectLeaderboard can't find block [${block}] data Error!! try again`))
		return resolve(await selectLeaderboard(block-1))
	}
	let node, free
	try {
		node = JSON.parse(_node)
		free = JSON.parse(_free)
	} catch (ex) {
		logger(Colors.blue(`selectLeaderboard JSON.parse [${ block }] data Error!`))
		return resolve(false)
	}
	logger(Colors.blue(`selectLeaderboard got [${block}] data!`))
	leaderboardData.epoch = block.toString()
	leaderboardData.free_cntp = free.cntp
	leaderboardData.free_referrals = free.referrals
	leaderboardData.guardians_cntp = node.cntp
	leaderboardData.guardians_referrals = node.referrals
	free_referrals_rate_lists = free.referrals_rate_list
	guardians_referrals_rate_lists = node.referrals_rate_list
	minerRate = free.minerRate
	totalMiner = free.totalMiner
	return (true)
})

const getMinerCount = (livenessListeningPool: Map <string, livenessListeningPoolObj>) => new Promise( resolve => {
	const message =JSON.stringify({walletAddress: nodeWallet})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	return sendMesageToCluster('/api/getTotalMiners', sendData, livenessListeningPool, (err, data) => {
		if (err) {
			logger(Colors.grey(`checkMiner sendMesageToCluster /api/minerCheck gor Error${err}`))
			//	let client try again
			return resolve (false)
		}
		return resolve (data)
	})
	
})
const tokensEachEPOCH = 34.72
const transferMiners = async (EPOCH: number, livenessListeningPool: Map <string, livenessListeningPoolObj>) => {
	const tryTransfer = async () => {

		const data: any = await getMinerCount (livenessListeningPool)

		if ( data === false || !data?.totalMiner) {
			return logger(Colors.red(`transferMiners EPOCH [${EPOCH}] getMinerCount return Error!`), inspect(data, false, 3, true)) 
		}

		totalminerOnline = data.totalMiner
		minerRate = tokensEachEPOCH/totalminerOnline
		
		const paymentWallet: string[] = []
		livenessListeningPool.forEach (n => {
			paymentWallet.push(n.wallet)
		})
		
		if (paymentWallet.length > 0) {

			transferPool.push({
				privateKey: masterSetup.conetFaucetAdmin,
				walletList: paymentWallet,
				payList: paymentWallet.map(n => minerRate.toFixed(10))
			})
			await startTransfer()
		}
		
	}
	
	await tryTransfer()
	
}


const clusterManager = 'apitests.conet.network'
const stratlivenessV2 = async (block: number, livenessListeningPool: Map <string, livenessListeningPoolObj>) => {
	
	
	logger(Colors.blue(`stratliveness EPOCH ${block} starting! ${nodeWallet} Pool length = [${livenessListeningPool.size}]`))

	// clusterNodes = await getApiNodes()
	const processPool: any[] = []
	
	livenessListeningPool.forEach(async (n, key) => {
		const res = n.res
		const returnData = {
			rate: minerRate,
			online: totalminerOnline,
			status: 200,
			epoch: block
		}
		processPool.push(testMinerCOnnecting(res, returnData, key, n.ipaddress, livenessListeningPool))

	})

	await Promise.all(processPool)

	const wallets: string[] = []

	livenessListeningPool.forEach((value: livenessListeningPoolObj, key: string) => {
		wallets.push (value.wallet)
	})

	logger(Colors.grey(`stratliveness EPOCH ${block} stoped! Pool length = [${livenessListeningPool.size}]`))
	await transferMiners(block, livenessListeningPool)
}

const deleteAMiner = (ipaddress: string, wallet: string, livenessListeningPool: Map <string, livenessListeningPoolObj> ) => new Promise( resolve => {
	if (!isPublic(ipaddress)) {
		logger(Colors.grey(`checkMiner [${ipaddress}:${wallet}] has a Local IP address!`))
		return resolve (false)
	}
	const message =JSON.stringify({ipAddress: ipaddress, walletAddress: nodeWallet, walletAddress1: wallet})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	return sendMesageToCluster('/api/deleteMiner', sendData,livenessListeningPool,  (err, data) => {
		if (err) {
			logger(Colors.red(`deleteAMiner sendMesageToCluster /api/deleteMiner gor Error${err}`))
			//	let client try again
			return resolve (false)
		}
		return resolve (true)
	})
})

const launshAndDeleteAllWalletInCLuster = ( livenessListeningPool: Map <string, livenessListeningPoolObj>) => new Promise( resolve => {
	const message =JSON.stringify({walletAddress: nodeWallet})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	sendMesageToCluster('/api/nodeRestart', sendData, livenessListeningPool, (err, data) => {
		if (err) {
			logger(Colors.grey(`checkMiner sendMesageToCluster /api/minerCheck gor Error${err}`))
			//	let client try again
			return resolve (false)
		}
		return resolve (data)
	})
	
})

const startListeningCONET_Holesky_EPOCH = async (livenessListeningPool: Map <string, livenessListeningPoolObj>) => {
	
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	EPOCH = await provideCONET.getBlockNumber()
	
	logger(Colors.magenta(`startListeningCONET_Holesky_EPOCH_v2 [${EPOCH}] start!`))

	provideCONET.on('block', async block => {
		EPOCH = block
		return stratlivenessV2(block.toString(), livenessListeningPool)
	})

	regiestMiningNode()
	launshAndDeleteAllWalletInCLuster(livenessListeningPool)
}


let sendAlldataProcess = false

const sendAlldata = (livenessListeningPool: Map <string, livenessListeningPoolObj>) => new Promise( resolve => {
	const minerArray: minerArray[]  = []
	livenessListeningPool.forEach((v, k) => {
		minerArray.push({address: v.ipaddress, wallet: v.wallet})
	})

	const message =JSON.stringify({ walletAddress: nodeWallet, data: minerArray})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	return sendMesageToCluster('/api/nodeRestart', sendData, livenessListeningPool, (err, data) => {
		if (err) {
			logger(Colors.grey(`sendAlldata sendMesageToCluster /api/minerCheck gor Error${err}`))
			//	let client try again
			
			return resolve (err)
		}
		return resolve (data)
	})
})

const sendMesageToCluster = async (path: string, pData: any, livenessListeningPool: Map <string, livenessListeningPoolObj>, callbak: (err: number|undefined, data?: any)=> void) => {


	// const res = await p({
	// 	'url': `${clusterManager}${path}`,
	// 	method: 'POST',
	// 	data: pData
	// })

	// if (res.statusCode !== 200 ) {
	// 	if (res.statusCode === 401) {
	// 		if (!sendAlldataProcess) {
	// 			sendAlldataProcess = true
	// 			await sendAlldata ()
	// 			sendAlldataProcess = false
	// 		}
	// 		setTimeout(async () => {
	// 			return sendMesageToCluster(path, pData, callbak)
	// 		}, 2000)
	// 		return
	// 	}
	// 	return callbak(res.statusCode)
	// }
	// return callbak (undefined, res.body)

	const postData = JSON.stringify(pData)
	const option: RequestOptions = {
		hostname: clusterManager,
		protocol: 'https:',
		path,
		port: 8001,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(postData),
		}
	}

	const req = await request (option, async res => {
		let data = ''
		logger(Colors.grey(`sendMesageToCluster [${path}] got response res Status ${res.statusCode}`))
		if (res.statusCode !== 200) {
			console.log(`HEADERS: ${JSON.stringify(res.headers)}`)
			if (res.statusCode === 401) {
				logger(Colors.blue(`sendMesageToCluster got initData request!`))
				//	let client try again
			
				if (!sendAlldataProcess) {
					sendAlldataProcess = true
					await sendAlldata (livenessListeningPool)
					sendAlldataProcess = false
				}

				return setTimeout(async () => {
					return sendMesageToCluster(path, pData, livenessListeningPool, callbak)
				}, 2000)
				
			}
			return callbak(res.statusCode)
		}


		res.on('data', _data => {
			data += _data
		})

		res.once('end', () => {

			try {
				const ret = JSON.parse(data)
				return callbak (undefined, ret)
			} catch (ex: any) {
				console.error(`sendMesageToCluster [${path}] getReferrer JSON.parse Error!`, data)
				return callbak (403)
			}
			
		})

		res.once('error', err => {
			logger(Colors.red(`sendMesageToCluster res on error!`))
			logger(err)
			return callbak (503)
		})
	})

	req.once('error', (e) => {
		console.error(`getReferrer req on Error! ${e.message}`)
		return callbak (503)
	})

	req.write(postData)
	req.end()
}

const _provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
const nodeWallet = new ethers.Wallet(masterSetup.conetFaucetAdmin, _provider).address.toLowerCase()

const checkMiner = (ipaddress: string, wallet: string, livenessListeningPool: Map <string, livenessListeningPoolObj> ) => new Promise( resolve => {
	if (!isPublic(ipaddress)) {
		logger(Colors.grey(`checkMiner [${ipaddress}:${wallet}] has a Local IP address!`))
		return resolve (false)
	}

	const message =JSON.stringify({ipAddress: ipaddress, walletAddress: nodeWallet, walletAddress1: wallet})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	return sendMesageToCluster('/api/minerCheck', sendData, livenessListeningPool, async (err, data) => {
		if (err) {
			
			return resolve (err)
		}
		return resolve (data)
	})
})


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
const CGPNsAddr = '0x5e4aE81285b86f35e3370B3EF72df1363DD05286'

const guardianNodesList: string[] = []
 
const unlockCNTP = async (wallet: string, privateKey: string) => {
	const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const walletObj = new ethers.Wallet(privateKey, provider)
	const cCNTPContract = new ethers.Contract(cCNTP_Contract, CNTPAbi, walletObj)
	let tx
	try {
		tx = await cCNTPContract.changeAddressInWhitelist(wallet, true)
	} catch (ex: any) {
		logger(Colors.red(`unlockCNTP error! Try again`), ex.message)
		return setTimeout(() => {
			unlockCNTP(wallet, privateKey)
		}, Math.round( 10 * Math.random()) * 1000)
	}
	logger(Colors.gray(`unlockCNTP [${wallet}] success! tx = ${tx.hash}`) )
}

const getAllOwnershipOfGuardianNodes = async (provideCONET: ethers.JsonRpcProvider) => {
	const guardianSmartContract = new ethers.Contract(CGPNsAddr, CGPNsABI,provideCONET)
	let nodes
	try {
		nodes = await guardianSmartContract.getAllIdOwnershipAndBooster()
	} catch (ex: any) {
		return logger(Colors.grey(`nodesAirdrop guardianSmartContract.getAllIdOwnershipAndBooster() Error! STOP `), ex.mesage)
	}
	const _nodesAddress: string[] = nodes[0].map((n: string) => n.toLowerCase())

	const NFTIds = _nodesAddress.map ((n, index) => 100 + index)

	let NFTAssets: number[]

	try {
		NFTAssets = await guardianSmartContract.balanceOfBatch(_nodesAddress, NFTIds)
	} catch (ex: any) {
		return logger(Colors.red(`nodesAirdrop guardianSmartContract.balanceOfBatch() Error! STOP`), ex.mesage)
	}


	NFTAssets.forEach((n, index) => {
		if (n || '0x345837652d9832a8398AbACC956De27b9B2923E1'.toLowerCase() === _nodesAddress[index]) {
			guardianNodesList.push(_nodesAddress[index])
		}
	})
	logger(Colors.blue(`guardianNodesList length = [${guardianNodesList.length}]`))
}


interface conetData {
	address: string
	balance: BigInt
}

const etherNew_Init_Admin = new ethers.Wallet (masterSetup.conetFaucetAdmin, new ethers.JsonRpcProvider(conet_Holesky_rpc))
const sentData = async (data: conetData, callback: (err?: null) => void) => {

	
	try{
		const addr = ethers.getAddress(data.address)
		const tx = {
			to: addr,
			// Convert currency unit from ether to wei
			value: data.balance.toString()
		}
		await etherNew_Init_Admin.sendTransaction(tx)
	} catch (ex) {
		console.log(Colors.red(`${data.balance} CONET => [${data.address}] Error!`))
		return callback(null)
	}
	console.log(Colors.grey(`${data.balance} CONET => [${data.address}]`))
	return callback ()
}
let totalminerOnline = 0
const transCONETArray: conetData[] = []
let transCONETLock = false
const transCONET = (address: string, balance: BigInt) => {
	transCONETArray.push ({
		address, balance
	})
	
	const trySent = async () => {
		const data = transCONETArray.shift()
		if (!data) {
			transCONETLock = false
			return
		}
		transCONETLock = true
		return sentData(data, () => {
			trySent ()
		})
	}

	if (!transCONETLock) {
		trySent()
	}
	
}

let EPOCH = 0
const addIpaddressToLivenessListeningPool = (ipaddress: string, wallet: string, res: Response, livenessListeningPool: Map <string, livenessListeningPoolObj> ) => {
	const obj: livenessListeningPoolObj = {
		ipaddress, wallet, res
	}
	livenessListeningPool.set (wallet, obj)
	const returnData = {
		rate: minerRate,
		online: totalminerOnline,
		ipaddress,
		status: 200,
		epoch: EPOCH
	}
	logger (Colors.cyan(` [${ipaddress}:${wallet}] Added to livenessListeningPool [${livenessListeningPool.size}]!`))
	return returnData
}

class conet_dl_server {

	private PORT = 80
	private appsPath = ''
	private debug = false
	private serverID = ''
	private si_pool: nodeType[] = []
	private masterBalance: CNTPMasterBalance|null = null
	private s3Pass: s3pass|null = null
	public livenessListeningPool: Map <string, livenessListeningPoolObj> = new Map()

	private initSetupData = async () => {
		this.startServer()
	}

	constructor () {
		this.initSetupData ()
		startListeningCONET_Holesky_EPOCH(this.livenessListeningPool)
    }

	private startServer = async () => {
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use( Cors ())

		app.use (async (req, res, next) => {

			const ipaddress = getIpAddressFromForwardHeader(req)
			if (!ipaddress) {
				res.status(404).end()
				return res.socket?.end().destroy()
			}

			
				
			if (/^post$/i.test(req.method)) {
				
				return Express.json({limit: '25mb'})(req, res, err => {
					if (err) {
						res.sendStatus(400).end()
						res.socket?.end().destroy()
						logger(Colors.red(`/^post$/i.test Attack black ${ipaddress} ! ${req.url}`))
						logger(inspect(req.body, false, 3, true))
						return addAttackToCluster (ipaddress)
						
					}
					return next()
				})
			}
				
			return next()
			
		})

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
			logger (Colors.red(`get unknow router from ${ipaddress} => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end ()
			return res.socket?.end().destroy()
		})

		server.listen(this.PORT, () => {
			return console.table([
                { 'CoNET DL': `version ${version} startup success ${ this.PORT } Work [${workerNumber}] server key [${cntpAdminWallet.address}]` }
            ])
		})
		
		
	}

	private router ( router: Router ) {
		router.get ('/health', async (req,res) => {

			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(` Router /health form [${ ipaddress}]`))

			res.json ({ health: true }).end()
			return res.socket?.end().destroy()

		})
		router.post ('/startMining', async (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger(Colors.blue(`ipaddress [${ipaddress}] => /startMining`))
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /livenessListening message = req.body.message ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
				
			}
			if (!message||!signMessage||!ipaddress) {
				logger (Colors.grey(`Router /livenessListening !message||!signMessage Error! [${ipaddress}]`))
				return  res.status(404).end()
				
			}
			logger(Colors.blue(`ipaddress [${ipaddress}] CHECK OBJ => /startMining`))
			const obj = checkSignObj (message, signMessage)

			if (!obj) {
				logger (Colors.grey(`[${ipaddress}] to /startMining !obj Error!`))
				res.status(404).end()
				return res.socket?.end().destroy()
			}
			const m: any = await checkMiner(ipaddress, obj.walletAddress, this.livenessListeningPool )

			// const m = await freeMinerManager(ipaddress, obj.walletAddress)

			if (typeof m === 'number' ) {

				logger(Colors.grey(`${ipaddress}:${obj.walletAddress} /startMining freeMinerManager false!`))
				return res.status(m).end()
			}
			
			res.status(200)
			res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Connection', 'keep-alive')
            res.flushHeaders() // flush the headers to establish SSE with client
			const returnData = addIpaddressToLivenessListeningPool(ipaddress, obj.walletAddress, res, this.livenessListeningPool)
			res.write(JSON.stringify (returnData)+'\r\n\r\n')	
			
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


