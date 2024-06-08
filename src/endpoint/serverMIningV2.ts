/**
 * 			
 * */
import Express, { Router } from 'express'
import { inspect } from 'node:util'
import Colors from 'colors/safe'
import Cluster from 'node:cluster'
import {ethers} from 'ethers'
const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`
import { getIpAddressFromForwardHeader,regiestMiningNode } from './help-database'
import {sign} from 'eth-crypto'
import {createServer, RequestOptions, request as HttpRequest} from 'node:https'
import {conet_Referral_contractV2, masterSetup} from '../util/util'
import {abi as CONET_Referral_ABI} from '../util/conet-referral.json'
import {logger} from '../util/logger'
import epochRateABI from '../util/epochRate.json'
import p from "phin"
import { checkSignObj} from '../util/util'
import {transferPool, startTransfer} from '../util/transferManager'
import type {Response, Request } from 'express'
import { address, isPublic, isV4Format, isV6Format} from 'ip'

const ReferralsMap: Map<string, string> = new Map()
const conet_Holesky_rpc = 'https://rpc.conet.network'
const ReferralsV2Addr = '0x64Cab6D2217c665730e330a78be85a070e4706E7'.toLowerCase()
const epochRateAddr = '0x9991cAA0a515F22386Ab53A5f471eeeD4eeFcbD0'

const checkBlockEvent = async (block: number, provider: ethers.JsonRpcProvider) => {
	const blockDetail = await provider.getBlock(block)
	if (!blockDetail?.transactions) {
		return logger(Colors.gray(`Block ${block} hasn't transactions SKIP!`))
	}

	for (let u of blockDetail.transactions) {
		await detailTransfer(u, provider)
	}

}

interface epochRate {
	totalNodes:string
	epoch: string
	totalMiner: string
}

const epochRate: epochRate[]= []

const detailTransfer = async (transferHash: string, provider: ethers.JsonRpcProvider) => {
	const transObj = await provider.getTransactionReceipt(transferHash)
	const toAddr = transObj?.to
	if ( toAddr && toAddr.toLowerCase() === ReferralsV2Addr) {
		
		const wallet = transObj.from.toLowerCase()
		logger(Colors.grey(`ReferralsV2Addr has event! from ${wallet}`))
		let address
		try {
			const contract = new ethers.Contract(conet_Referral_contractV2, CONET_Referral_ABI, new ethers.JsonRpcProvider(conet_Holesky_rpc))
			address = await contract.getReferrer(wallet)
		} catch (ex){
			logger(Colors.red(`detailTransfer contract.getReferrer Error!`))
			return
		}

		if (!address || address === '0x0000000000000000000000000000000000000000') {
			return logger(Colors.red(`detailTransfer contract.getReferrer get null address`))
		}
		address = address.toLowerCase()
		ReferralsMap.set(wallet, address)
		logger(Colors.blue(`detailTransfer add Referrer [${wallet} => ${address}] to ReferralsMap success! ReferralsMap length = [${ReferralsMap.size}]`))
	}
}

// const startListeningCONET_Holesky_EPOCH = async () => {
// 	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
// 	provideCONET.on('block', async block => {
// 		startTransfer()
// 		return checkBlockEvent (block, provideCONET)
// 	})
// }
const livenessListeningPool: Map <string, livenessListeningPoolObj> = new Map()

const tokensEachEPOCH = 34.72
let totalminerOnline = 0
let minerRate = 0

const _provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
const nodeWallet = new ethers.Wallet(masterSetup.conetFaucetAdmin, _provider).address.toLowerCase()

const clusterManager = 'apitests.conet.network'
let sendAlldataProcess = false

export const sendAlldata = () => new Promise( resolve => {
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

	return sendMesageToCluster('/api/nodeRestart', sendData, (err, data) => {
		if (err) {
			logger(Colors.grey(`sendAlldata sendMesageToCluster /api/minerCheck gor Error${err}`))
			//	let client try again
			
			return resolve (err)
		}
		return resolve (data)
	})
})

const sendMesageToCluster = async (path: string, pData: any, callbak: (err: number|undefined, data?: any)=> void) => {


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
		port: 443,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(postData),
		}
	}

	const req = await HttpRequest (option, async res => {
		let data = ''
		logger(Colors.grey(`sendMesageToCluster [${path}] got response res Status ${res.statusCode}`))
		if (res.statusCode !== 200) {
			console.log(`HEADERS: ${JSON.stringify(res.headers)}`)
			if (res.statusCode === 401) {
				logger(Colors.blue(`sendMesageToCluster got initData request!`))
				//	let client try again
			
				if (!sendAlldataProcess) {
					sendAlldataProcess = true
					await sendAlldata ()
					sendAlldataProcess = false
				}

				return setTimeout(async () => {
					return sendMesageToCluster(path, pData, callbak)
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

export const getMinerCount = () => new Promise( resolve => {
	const message =JSON.stringify({walletAddress: nodeWallet})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	return sendMesageToCluster('/api/getTotalMiners', sendData, (err, data) => {
		if (err) {
			logger(Colors.grey(`checkMiner sendMesageToCluster /api/minerCheck gor Error${err}`))
			//	let client try again
			return resolve (false)
		}
		return resolve (data)
	})
	
})
const transferMiners = async (EPOCH: number) => {
	const tryTransfer = async () => {

		const data: any = await getMinerCount ()

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

export const deleteAMiner = (ipaddress: string, wallet: string ) => new Promise( resolve => {
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

	return sendMesageToCluster('/api/deleteMiner', sendData, (err, data) => {
		if (err) {
			logger(Colors.red(`deleteAMiner sendMesageToCluster /api/deleteMiner gor Error${err}`))
			//	let client try again
			return resolve (false)
		}
		return resolve (true)
	})
})

const launshAndDeleteAllWalletInCLuster = () => new Promise( resolve => {
	const message =JSON.stringify({walletAddress: nodeWallet})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	sendMesageToCluster('/api/nodeRestart', sendData, (err, data) => {
		if (err) {
			logger(Colors.grey(`checkMiner sendMesageToCluster /api/minerCheck gor Error${err}`))
			//	let client try again
			return resolve (false)
		}
		return resolve (data)
	})
	
})

const testMinerCOnnecting = (res: Response, returnData: any, wallet: string, ipaddress: string) => new Promise (resolve=> {
	returnData['wallet'] = wallet
	if (res.writable && !res.closed) {
		return res.write( JSON.stringify(returnData)+'\r\n\r\n', async err => {
			if (err) {
				deleteAMiner(ipaddress, wallet)
				logger(Colors.grey (`stratliveness write Error! delete ${wallet}`))
				livenessListeningPool.delete(wallet)
			}
			return resolve (true)
		})
		
	}
	deleteAMiner(ipaddress, wallet)
	livenessListeningPool.delete(wallet)
	logger(Colors.grey (`stratliveness write Error! delete ${wallet}`))
	return resolve (true)
})

const stratlivenessV2 = async (block: number) => {
	
	
	logger(Colors.blue(`stratliveness EPOCH ${block} starting! ${nodeWallet} Pool length = [${livenessListeningPool.size}]`))

	// clusterNodes = await getApiNodes()
	const processPool: any[] = []
	
	livenessListeningPool.forEach(async (n, key) => {
		const res = n.res
		const returnData = {
			rate: minerRate.toFixed(6),
			online: totalminerOnline,
			status: 200,
			epoch: block
		}
		processPool.push(testMinerCOnnecting(res, returnData, key, n.ipaddress))

	})

	await Promise.all(processPool)

	const wallets: string[] = []

	livenessListeningPool.forEach((value: livenessListeningPoolObj, key: string) => {
		wallets.push (value.wallet)
	})

	logger(Colors.grey(`stratliveness EPOCH ${block} stoped! Pool length = [${livenessListeningPool.size}]`))
	await transferMiners(block)
}

export const startListeningCONET_Holesky_EPOCH_v2 = async () => {
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	EPOCH = await provideCONET.getBlockNumber()
	
	logger(Colors.magenta(`startListeningCONET_Holesky_EPOCH_v2 [${EPOCH}] start!`))

	provideCONET.on('block', async block => {
		EPOCH = block
		return stratlivenessV2(block.toString())
	})

	await regiestMiningNode()
	await launshAndDeleteAllWalletInCLuster()
}



const checkMiner = (ipaddress: string, wallet: string ) => new Promise( resolve => {
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

	return sendMesageToCluster('/api/minerCheck', sendData, async (err, data) => {
		if (err) {
			
			return resolve (err)
		}
		return resolve (data)
	})
})
let EPOCH = 0
export const addIpaddressToLivenessListeningPool = (ipaddress: string, wallet: string, res: Response) => {
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

class conet_mining_server {

	private PORT = 80

	constructor () {
		this.startServer()
		startListeningCONET_Holesky_EPOCH_v2()
		
    }

	private startServer = async () => {
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use( Cors ())
		app.use(Express.json())
		app.use( '/api', router )
		
		app.use(Express.json({limit: '100mb'}));
		//app.use(Express.urlencoded({limit: '100mb'}));

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
			//logger (Colors.red(`get unknow router from ${ipaddress} => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end ()
			return res.socket?.end().destroy()
		})

		server.listen(this.PORT, () => {
			
			return console.table([
                { 'serverMIningV2 ': ` startup success ${ this.PORT } Work [${workerNumber}]` }
            ])
		})
	}

	private router ( router: Router ) {
		
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
			const m: any = await checkMiner(ipaddress, obj.walletAddress)

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
			const returnData = addIpaddressToLivenessListeningPool(ipaddress, obj.walletAddress, res)
			res.write(JSON.stringify (returnData)+'\r\n\r\n')	
			
		})

		router.all ('*', (req, res ) =>{
			
			logger (Colors.grey(`Router /api get unknow router [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

export default conet_mining_server