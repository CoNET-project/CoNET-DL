/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import Colors from 'colors/safe'
import Cluster from 'node:cluster'
import { logger, checkSign, newCNTP_Contract, getServerIPV4Address, conet_Holesky_rpc} from '../util/util'
import {ticket_contract} from './serverApiV3Master'
import CNTPAbi from '../util/cCNTP.json'
import {ethers} from 'ethers'
import type { RequestOptions } from 'node:http'
import {request} from 'node:http'
import {cntpAdminWallet, GuardianPurchase, GuardianPurchasePool} from './utilNew'
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {watch} from 'node:fs'

const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`

const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version
const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)

//			getIpAddressFromForwardHeader(req.header(''))
const getIpAddressFromForwardHeader = (req: Request) => {

	// logger(inspect(req.headers, false, 3, true))
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]||req.headers['X-Forwarded-For'.toLowerCase()]||req.headers['CF-Connecting-IP'.toLowerCase()]||req.ip
	if (!ipaddress) {
		return ''
	}
	if (typeof ipaddress === 'object') {
		return ipaddress[0]
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

const eposh_total: Map<number, number> = new Map()


const filePath = '/home/peter/.data/v2/'

const get_epoch_total = async () => {
	const block = currentEpoch - 1
	const filename1 = `${filePath}${block}.total`
	const data = await readFile(filename1, 'utf8')
	const total = parseInt(data)
	if (!isNaN (total)) {
		logger(Colors.blue(`get_epoch_total ${block} total = ${total}`))
		eposh_total.set(block, total)
	}
}


const unlockCNTP = async (wallet: string, privateKey: string) => {

	const walletObj = new ethers.Wallet(privateKey, provider)
	const cCNTPContract = new ethers.Contract(newCNTP_Contract, CNTPAbi, walletObj)
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

const postLocalhost = async (path: string, obj: any, _res: Response)=> {
	
	const option: RequestOptions = {
		hostname: 'localhost',
		path,
		port: 8002,
		method: 'POST',
		protocol: 'http:',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	
	const req = await request (option, res => {
		res.pipe(_res)
	})

	req.once('error', (e) => {
		console.error(`postLocalhost to master on Error! ${e.message}`,)
		if (_res.writable && !_res.writableEnded) {
			_res.status(502).end()
		}
		_res.socket?.destroy()
	})

	req.write(JSON.stringify(obj))
	req.end()
}

let currentEpoch = 0
const listenEpoch = async () => {
	
	
	
	watch(filePath, async (eventType, _filename) => {
		const filename = _filename||''
	
		if (/\.total$/.test(filename)) {
			currentEpoch = parseInt(filename.split('.')[0]) + 1
			await get_epoch_total()
		}
	})
	
	currentEpoch = await provider.getBlockNumber()
	await get_epoch_total()
}

const MaxCount = 1

const checkTicket = async (wallet: string) => {
	const [isApproved, balance ] = await Promise.all([
		ticket_contract.isApprovedForAll(wallet, '0x068759bCfd929fb17258aF372c30eE6CD277B872'),
		ticket_contract.balanceOf(wallet, 1)
	])
	logger(Colors.blue (`checkTicket account ${wallet} isApproved = ${isApproved} balance = ${balance}`))
	if (isApproved && balance.toString() > '0') {
		return true
	}
	return false
}

const countAccessPool: Map<string, number[]> = new Map()
class conet_dl_server {

	private PORT = 80
	private appsPath = ''
	private serverID = ''

	private initSetupData = async () => {

        logger (Colors.blue(`start local server!`))
		this.serverID = getServerIPV4Address(false)[0]
		logger(Colors.blue(`serverID = [${this.serverID}]`))
		this.startServer()
	}

	constructor () {
		this.initSetupData ()
    }

	private startServer = async () => {
		const staticFolder = join ( this.appsPath, 'static' )
		const launcherFolder = join ( this.appsPath, 'launcher' )
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use( Cors ())
		app.use ( Express.static ( staticFolder ))
        app.use ( Express.static ( launcherFolder ))
		app.use (async (req, res, next) => {

			const ipaddress = getIpAddressFromForwardHeader(req)
			
			if (!ipaddress) {
				logger(Colors.red(`clinet has not IP address error!`))
				res.status(404).end()
				return res.socket?.end().destroy()
			}

			const head = req.headers['host']
			
			if (!head || !/apiv3\.conet\.network/i.test(head)) {
				logger(Colors.magenta(`!/apiv3\.conet\.network/i.test(head) Error`))
				logger(inspect(req.headers, false, 3, true))
				res.status(404).end()
				return res.socket?.end().destroy()
			}
			
			const timeStamp = new Date().getTime()
			const count = countAccessPool.get(ipaddress)
			if (!count)	{
				countAccessPool.set(ipaddress, [timeStamp])
			} else {
				count.push(timeStamp)
				const _count = count.sort((a,b) => b-a).filter(v => v > timeStamp -1000)
				if (_count.length > MaxCount) {
					logger(`${ipaddress} _count.length ${_count.length} > MaxCount ${MaxCount} => ${req.method} return 503!!!!!!!!`)
					res.status(503).end()
					return res.socket?.end().destroy()
				}
			}

			logger(`${ipaddress} => ${req.method}`)

			if (/^post$/i.test(req.method)) {
				
				return Express.json({limit: '1mb'})(req, res, err => {
					if (err) {
						res.sendStatus(400).end()
						res.socket?.end().destroy()
						logger(Colors.red(`/^post$/i.test Attack black ${ipaddress} ! ${req.url}`))
						logger(inspect(req.body, false, 3, true))
						return 
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

		server.listen(this.PORT, '0.0.0.0', () => {

			return console.table([
                { 'CoNET DL': `version ${version} startup success ${ this.PORT } Work [${workerNumber}] server key [${cntpAdminWallet.address}]` }
            ])
		})
		
		
	}

	private router ( router: Router ) {
		
		router.get ('/health', async (req,res) => {
			if (res.writable && !res.writableEnded) {
				res.json ({ health: true }).end()
			}
			return res.socket?.end().destroy()

		})

		//********************			V2    		****** */		

		router.post ('/conet-faucet', async (req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /conet-faucet to [${ ipaddress }]`))
			let wallet_add = req.body?.walletAddr

			if (! wallet_add ||! ipaddress) {
				logger (`POST /conet-faucet ERROR! Have no walletAddr [${ipaddress}]`, inspect(req.body, false, 3, true))
				if (res.writable && !res.writableEnded) {
					res.status(400).end()
				}
				return res.socket?.end().destroy()
			}
			
			try {
				wallet_add = ethers.getAddress(wallet_add)
			} catch (ex) {
				logger(Colors.grey(`ethers.getAddress(${wallet_add}) Error!`))
				if (res.writable && !res.writableEnded) {
					return res.status(400).end()
				}
				
				return res.socket?.end().destroy()
			}
			
			return postLocalhost('/api/conet-faucet', {walletAddress: wallet_add, ipaddress}, res)

		})

		router.post ('/Purchase-Guardian', async (req,res) => {
			
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger(Colors.magenta(`/Purchase-Guardian`))
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}
			logger(Colors.magenta(`/Purchase-Guardian`), message, signMessage)
			GuardianPurchasePool.push({
				message,
				signMessage,
				ipaddress,
				res
			})

			GuardianPurchase()
		})

		router.post ('/ticket', async ( req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			if (!ipaddress) {
				return res.status(404).end()
			}
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			if (!message||!signMessage) {
				logger (Colors.grey(`Router /Purchase-Guardian !message||!signMessage Error!`), inspect(req.body, false, 3, true))
				return res.status(403).end()
			}

			const obj = checkSign (message, signMessage)

			if (!obj) {
				logger (Colors.grey(`Router /lottery checkSignObj obj Error!`), message, signMessage)
				return res.status(403).end()
			}

			obj.ipAddress = ipaddress
			return postLocalhost('/api/ticket', {obj}, res)
		})

		router.post ('/ticket-lottery', async ( req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			if (!ipaddress) {
				return res.status(404).end()
			}
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			if (!message||!signMessage) {
				logger (Colors.grey(`Router /Purchase-Guardian !message||!signMessage Error!`), inspect(req.body, false, 3, true))
				return res.status(403).end()
			}

			const obj = checkSign (message, signMessage)

			if (!obj) {
				logger (Colors.grey(`Router /lottery checkSignObj obj Error!`), message, signMessage)
				return res.status(403).end()
			}

			obj.ipAddress = ipaddress
			const check = await checkTicket(obj.walletAddress)

			if (!check) {
				return res.status(403).end()
			}

			return postLocalhost('/api/ticket-lottery', {obj}, res)
		})

		router.post ('/initV3',  async (req, res) => {

			const _wallet: string = req.body.walletAddress
			let wallet: string 
			try {
				wallet = ethers.getAddress(_wallet)
			} catch (ex) {
				return res.status(403).end()
			}
			logger(`/initV3`)
			return postLocalhost('/api/initV3', {wallet: wallet.toLowerCase()}, res)
			
		})
		
		router.post ('/ticket', async ( req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			if (!ipaddress) {
				return res.status(404).end()
			}

			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			if (!message||!signMessage) {
				logger (Colors.grey(`Router /Purchase-Guardian !message||!signMessage Error!`), inspect(req.body, false, 3, true))
				return res.status(403).end()
			}

			const obj = checkSign (message, signMessage)

			if ( !obj ) {
				logger (Colors.grey(`Router /lottery checkSignObj obj Error!`), message, signMessage)
				return res.status(403).end()
			}

			obj.ipAddress = ipaddress
			return postLocalhost('/api/ticket', {obj}, res)
		})

		router.post ('/twitter-listen',  async (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /twitter-listen req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			if (!message||!signMessage) {
				logger (Colors.grey(`Router /twitter-listen !message||!signMessage Error!`), inspect(req.body, false, 3, true))
				return res.status(403).end()
			}

			const obj = checkSign (message, signMessage)

			if (!obj) {
				logger (Colors.grey(`Router /twitter-listen checkSignObj obj Error!`), message, signMessage)
				return res.status(403).end()
			}

			return postLocalhost('/api/twitter-listen', {obj}, res)
			
		})

		router.post ('/tg-listen',  async (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /tg-listen req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			if (!message||!signMessage) {
				logger (Colors.grey(`Router /tg-listen !message||!signMessage Error!`), inspect(req.body, false, 3, true))
				return res.status(403).end()
			}

			const obj = checkSign (message, signMessage)

			if (!obj) {
				logger (Colors.grey(`Router /tg-listen checkSignObj obj Error!`), message, signMessage)
				return res.status(403).end()
			}

			return postLocalhost('/api/tg-listen', {obj}, res)
			
		})

		router.post ('/twitter-check-follow',  async (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /twitter-check-follow req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			if (!message||!signMessage) {
				logger (Colors.grey(`Router /twitter-check-follow !message|| !signMessage Error!`), inspect(req.body, false, 3, true))
				return res.status(403).end()
			}

			const obj = checkSign (message, signMessage)

			if (!obj || !obj.data ) {
				logger (Colors.grey(`Router /twitter-check-follow checkSignObj obj Error!`), message, signMessage)
				return res.status(403).end()
			}
			
			logger(Colors.grey(`${obj.walletAddress}:${ipaddress}  POST twitter-check-follow forward to master! `))
			return postLocalhost('/api/twitter-check-follow', {obj}, res)
			
		})

		router.post ('/twitter-callback',  async (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /twitter-callback req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			if (!message||!signMessage) {
				logger (Colors.grey(`Router /twitter-callback !message|| !signMessage Error!`), inspect(req.body, false, 3, true))
				return res.status(403).end()
			}

			const obj = checkSign (message, signMessage)

			if (!obj || !obj.data ) {
				logger (Colors.grey(`Router /twitter-callback checkSignObj obj Error!`), message, signMessage)
				return res.status(403).end()
			}
			logger(Colors.grey(`${obj.walletAddress}:${ipaddress}  POST twitter-callback forward to master! `))
			return postLocalhost('/api/twitter-callback', {obj}, res)
			
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

			// const response = await claimeToekn (message, signMessage)
			// if (response) {
			// 	return res.status(200).json({}).end()
			// }
			return res.status(403).end()

		})

		router.post ('/tg-callback',  async (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /tg-callback req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			if (!message||!signMessage) {
				logger (Colors.grey(`Router /tg-callback !message|| !signMessage Error!`), inspect(req.body, false, 3, true))
				return res.status(403).end()
			}

			const obj = checkSign (message, signMessage)

			if (!obj || !obj.data ) {
				logger (Colors.grey(`Router /tg-callback checkSignObj obj Error!`), message, signMessage)
				return res.status(403).end()
			}

			logger(Colors.grey(`${obj.walletAddress}:${ipaddress}  POST twitter-callback forward to master! `))
			return postLocalhost('/api/tg-callback', {obj}, res)
			
		})

		router.post ('/tg-check-follow',  async (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /tg-check-follow req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			if (!message||!signMessage) {
				logger (Colors.grey(`Router /tg-check-follow !message|| !signMessage Error!`), inspect(req.body, false, 3, true))
				return res.status(403).end()
			}

			const obj = checkSign (message, signMessage)

			if (!obj || !obj.data ) {
				logger (Colors.grey(`Router /tg-check-follow checkSignObj obj Error!`), message, signMessage)
				return res.status(403).end()
			}
			
			logger(Colors.grey(`${obj.walletAddress}:${ipaddress}  POST twitter-check-follow forward to master! `))
			return postLocalhost('/api/tg-check-follow', {obj}, res)
			
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

listenEpoch()