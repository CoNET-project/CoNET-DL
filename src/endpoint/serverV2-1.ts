/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import Dns from 'node:dns'
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
import {sign} from 'eth-crypto'

//	const testMiningDomain = '099b18b0166f6d0a.openpgp.online'.toLowerCase()


const testMinerCOnnecting = (res: Response, returnData: any, wallet: string, ipaddress: string, server: string, livenessListeningPool: Map <string, livenessListeningPoolObj>) => 
	new Promise (async resolve => {
		returnData['wallet'] = wallet
		if (res.writable && !res.closed) {
			return res.write( JSON.stringify(returnData)+'\r\n\r\n', async err => {
				if (err) {
					await deleteAMiner(server, ipaddress, wallet, livenessListeningPool)
					logger(Colors.grey (`stratliveness write Error! delete ${wallet}`))
					livenessListeningPool.delete(wallet)
				}
				return resolve (true)
			})
			
		}
		await deleteAMiner(server, ipaddress, wallet, livenessListeningPool)
		livenessListeningPool.delete(wallet)
		logger(Colors.grey (`stratliveness write Error! delete ${wallet}`))
		return resolve (true)
	})


	
const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`
//	for production
	import {createServer} from 'node:http'

//	for debug
	// import {createServer as createServerForDebug} from 'node:http'

const setup = join( homedir(),'.master.json' )
const masterSetup: ICoNET_DL_masterSetup = require ( setup )
const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version

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


const selectLeaderboard: (block: number) => Promise<boolean> = (block) => new Promise(async resolve => {
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

const getMinerCount = ( server: string, livenessListeningPool: Map <string, livenessListeningPoolObj>) => new Promise( resolve => {
	const message =JSON.stringify({walletAddress: nodeWallet})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	return sendMesageToCluster(server, '/api/getTotalMiners', sendData, livenessListeningPool, (err, data) => {
		if (err) {
			logger(Colors.grey(`checkMiner sendMesageToCluster /api/getTotalMiners gor Error ${err}`))
			//	let client try again
			return resolve (false)
		}
		return resolve (data)
	})
	
})

const transferMiners = async (EPOCH: number, livenessListeningPool: Map <string, livenessListeningPoolObj>) => {
	const tryTransfer = async () => {

		
		
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



const stratlivenessV2 = async (server: string, block: number, livenessListeningPool: Map <string, livenessListeningPoolObj>) => {
	const data: any = await getMinerCount (server, livenessListeningPool)
		
	if ( data === false || !data?.totalMiner) {
		return logger(Colors.red(`transferMiners EPOCH [${EPOCH}] getMinerCount return Error!`), inspect(data, false, 3, true)) 
	}

	totalminerOnline = parseInt(data.totalMiner)
	minerRate = parseFloat(data.minerRate)/12

	logger(Colors.blue (`getMinerCount reutrn data minerRate = tokensEachEPOCH/totalminerOnline tokensEachEPOCH [${data.tokensEachEPOCH}] / totalminerOnline ${data.totalMiner} = [${data.minerRate}]`), inspect(data, false, 3, true))
		
	logger(Colors.blue(`stratliveness EPOCH ${block} starting! ${nodeWallet} Local Pool length = [${livenessListeningPool.size}]`))

	// clusterNodes = await getApiNodes()
	const processPool: any[] = []

	const returnData = {
		rate: minerRate,
		online: totalminerOnline,
		status: 200,
		epoch: block
	}
	logger(inspect(returnData, false, 3, true	))
	livenessListeningPool.forEach(async (n, key) => {
		const res = n.res
		processPool.push(testMinerCOnnecting(res, returnData, key, n.ipaddress, server, livenessListeningPool))
	})

	await Promise.all(processPool)

	const wallets: string[] = []

	livenessListeningPool.forEach((value: livenessListeningPoolObj, key: string) => {
		wallets.push (value.wallet)
	})

	logger(Colors.grey(`stratliveness EPOCH ${block} stoped! Pool length = [${livenessListeningPool.size}]`))
	// await transferMiners(block, livenessListeningPool)
}

const deleteAMiner = (server: string, ipaddress: string, wallet: string, livenessListeningPool: Map <string, livenessListeningPoolObj> ) => new Promise( resolve => {
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

	return sendMesageToCluster(server, '/api/deleteMiner', sendData,livenessListeningPool,  (err, data) => {
		if (err) {
			logger(Colors.red(`deleteAMiner sendMesageToCluster /api/deleteMiner gor Error${err}`))
			//	let client try again
			return resolve (false)
		}
		return resolve (true)
	})
})

const launshAndDeleteAllWalletInCLuster = ( server: string, livenessListeningPool: Map <string, livenessListeningPoolObj>) => new Promise( resolve => {
	const message =JSON.stringify({walletAddress: nodeWallet})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	sendMesageToCluster(server, '/api/nodeRestart', sendData, livenessListeningPool, (err, data) => {
		if (err) {
			logger(Colors.grey(`checkMiner sendMesageToCluster /api/minerCheck gor Error${err}`))
			//	let client try again
			return resolve (false)
		}
		return resolve (data)
	})
	
})

const startListeningCONET_Holesky_EPOCH = async (server: string, livenessListeningPool: Map <string, livenessListeningPoolObj>) => {
	
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	EPOCH = await provideCONET.getBlockNumber()
	
	logger(Colors.magenta(`startListeningCONET_Holesky_EPOCH_v2 [${EPOCH}] start!`))

	provideCONET.on('block', async block => {
		EPOCH = block
		return stratlivenessV2(server, block.toString(), livenessListeningPool)
	})

	await regiestMiningNode()
	await launshAndDeleteAllWalletInCLuster(server, livenessListeningPool)
}


let sendAlldataProcess = false

const sendAlldata = (server: string, livenessListeningPool: Map <string, livenessListeningPoolObj>) => new Promise( resolve => {
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

	return sendMesageToCluster(server, '/api/nodeRestart', sendData, livenessListeningPool, (err, data) => {
		if (err) {
			logger(Colors.grey(`sendAlldata sendMesageToCluster /api/minerCheck gor Error${err}`))
			//	let client try again
			
			return resolve (err)
		}
		return resolve (data)
	})
})

const sendMesageToCluster = (server: string, path: string, pData: any, livenessListeningPool: Map <string, livenessListeningPoolObj>, callbak: (err: number|undefined, data?: any)=> void) => {

	const postData = JSON.stringify(pData)
	const option: RequestOptions = {
		hostname: server,
		protocol: 'http:',
		path,
		port: 8001,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(postData),
		}
	}
	logger(inspect(option, false, 3, true))
	const req = request (option, async res => {
		let data = ''
		
		if (res.statusCode !== 200) {
			logger(Colors.grey(`sendMesageToCluster [${path}] got response res Status ${res.statusCode}`))
			if (res.statusCode === 401) {
				logger(Colors.blue(`sendMesageToCluster got initData request!`))
				//	let client try again
			
				if (!sendAlldataProcess) {
					sendAlldataProcess = true
					await sendAlldata (server, livenessListeningPool)
					sendAlldataProcess = false
				}

				return setTimeout(async () => {
					return sendMesageToCluster(server, path, pData, livenessListeningPool, callbak)
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

const checkMiner = (server: string, ipaddress: string, wallet: string, livenessListeningPool: Map <string, livenessListeningPoolObj> ) => new Promise( resolve => {
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

	return sendMesageToCluster(server, '/api/minerCheck', sendData, livenessListeningPool, async (err, data) => {
		if (err) {
			
			return resolve (err)
		}
		return resolve (data)
	})
})


//			getIpAddressFromForwardHeader(req.header(''))
const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()] || req.headers['x-forwarded-for'.toLowerCase()] ||''
	if (typeof ipaddress === 'object') 
		return ipaddress[0]
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
	public clusterIpaddress =''
	public cluserIpAddrReg = new RegExp('')
	private initSetupData = () => {
		Dns.resolve(this.domain, (err, address) => {
			if ( err ) {
				return logger(Colors.red(`conet_dl_server resolve mainMiningDomain got error, STOP `), err.message )
			}
			if (!address.length ) {
				return logger(Colors.red(`conet_dl_server resolve mainMiningDomain null address [${address}]`))
			}
			this.clusterIpaddress = address[0]
			this.cluserIpAddrReg = new RegExp(this.clusterIpaddress + '$')
			this.startServer()
			startListeningCONET_Holesky_EPOCH(this.clusterIpaddress, this.livenessListeningPool)
		})
		
	}

	constructor (private domain: string) {
		this.cluserIpAddrReg = new RegExp(domain)
		this.initSetupData ()
		
    }

	private startServer = async () => {
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use( Cors ())
		app.use(Express.json())
		app.use (async (req, res, next) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			const readIp = req?.socket?.remoteAddress

			if (!readIp || !this.cluserIpAddrReg.test(readIp) || !ipaddress) {
				logger(Colors.magenta(`app.use req.socket.remote = ${inspect(req.socket.remoteAddress, false, 3, true)} cluster IP adderss = [${inspect(this.clusterIpaddress, false, 3, true)}] getIpAddressFromForwardHeader ipaddress = [${ipaddress}] => req = ${req.url}`))
				res.end()
				res.socket?.end().destroy()
				return
			}

			if (/^post$/i.test(req.method)) {
				
				return Express.json ({limit: '25mb'}) (req, res, async err => {
					if (err) {
						logger(Colors.red(`[${ipaddress}] ${req.method} => ${req.url} Express.json Error! ATTACK stop request`))
						res.sendStatus(410).end()
						return res.socket?.end().destroy()
					}
					return next()
				})
			}

			logger(Colors.magenta(`app.use all other request STOP it! req.socket.remote = ${inspect(req.socket.remoteAddress, false, 3, true)} getIpAddressFromForwardHeader ipaddress = [${ipaddress}] => req = ${req.url}`))
			res.sendStatus(410).end()
			return res.socket?.end().destroy()
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
                { 'CoNET DL': `version ${version} startup success ${ this.PORT } Work [${workerNumber}] server key [${cntpAdminWallet.address}] domain [${this.domain}]` }
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
				logger (Colors.grey(`${ipaddress} request /startMining message = req.body.message ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(411).end()
				
			}
			if (!message||!signMessage||!ipaddress) {
				logger (Colors.grey(`Router /startMining !message||!signMessage Error! [${ipaddress}]`))
				return  res.status(412).end()
				
			}
			logger(Colors.blue(`ipaddress [${ipaddress}] CHECK OBJ => /startMining`))
			const obj = checkSignObj (message, signMessage)

			if (!obj) {
				logger (Colors.grey(`[${ipaddress}] to /startMining !obj Error!`))
				res.status(413).end()
				return res.socket?.end().destroy()
			}


			const m: any = await checkMiner(this.clusterIpaddress, ipaddress, obj.walletAddress, this.livenessListeningPool )

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

		router.all ('*', (req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}


const [,,...args] = process.argv
args.forEach ((n, index ) => {
	new conet_dl_server (n)
})



