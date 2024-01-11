/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { CoNET_SI_Register, regiestFaucet, getLast5Price, conetcash_getBalance, CoNET_SI_health } from './help-database'
import Colors from 'colors/safe'
import { homedir } from 'node:os'
import {v4} from 'uuid'

import {readFileSync} from 'node:fs'
import { logger, loadWalletAddress, getSetup, return404, decryptPayload, decryptPgpMessage, makePgpKeyObj, checkSignObj, checkSign, checkReferralSign, getCNTPMastersBalance, listedServerIpAddress} from '../util/util'
import {createServer} from 'node:https'


import {createServer as createServerForDebug} from 'node:http'

import { ethers } from 'ethers'

// const privateKey = readFileSync('/etc/letsencrypt/live/openpgp.online/privkey.pem')
// const certificate = readFileSync( '/etc/letsencrypt/live/openpgp.online/fullchain.pem' )
const nodesPath = join(homedir(),'nodes,son')
const setup = join( homedir(),'.master.json' )
const masterSetup: ICoNET_DL_masterSetup = require ( setup )
const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version

// const getRedirect = (req: Request, res: Response ) => {
// 	const worker = Cluster?.worker?.id ? Cluster.worker.id : 5
// 	switch (worker) {
// 		case 4:
// 		case 1: {
// 			const localtion = `https://conettech.ca`
// 			logger (Colors.red(`get [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }] redirect to ${ localtion }!`))
// 			return res.writeHead(301, { "Location": localtion }).end ()
// 		}
// 		case 2: {
// 			const localtion = `https://kloak.io`
// 			logger (Colors.red(`get [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }] redirect to ${ localtion }!`))
// 			return res.writeHead(301, { "Location": localtion }).end ()
// 		}
// 		case 3: {
// 			const localtion = `https://kloak.app`
// 			logger (Colors.red(`get [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }] redirect to ${ localtion }!`))
// 			return res.writeHead(301, { "Location": localtion }).end ()
// 		}
		
// 		default : {
// 			const localtion = `https://conettech.ca`
// 			logger (Colors.red(`goto default [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }] redirect to ${ localtion }!`))
// 			return res.writeHead(301, { "Location": localtion }).end ()
// 		}
// 	}
// }


interface snedMessageWaitingObj {
	resolve: (cmd:clusterMessage|null) => void
	timeOutObj: NodeJS.Timeout
}

const sendDisConnecting = (walletAddress: string) => {
	if ( process.connected && typeof process.send === 'function') {
		const cmd: clusterMessage = {
			cmd:'livenessLoseConnecting',
			data: [walletAddress],
			uuid: '',
			err: null
		}
		
		return process.send (cmd)
	}
}

//			getIpAddressFromForwardHeader(req.header(''))
const getIpAddressFromForwardHeader = (req: Request) => {

	if (!req.ip) {
		return null
	}
	if (/\:/.test(req.ip)) {
		return req.ip.split(':')[1]
	}
	return req.ip
}

class conet_dl_server {

	private PORT: any
	private appsPath = ''
	private initData: ICoNET_NodeSetup|null = null
	private debug = false

	private si_pool: nodeType[] = []
	private livenessListeningPool: Map <string, Response> = new Map()
	private sendCommandWaitingPool: Map <string, snedMessageWaitingObj> = new Map()
	private livenessHash = ''
	private masterBalance: CNTPMasterBalance|null = null
	private sendCommandToMasterAndWaiting: (cmd: clusterMessage) => Promise<clusterMessage|null> = (cmd ) => new Promise(resolve=> {
		if ( process.connected && typeof process.send === 'function') {
			const timeSet = setTimeout(() => {
				logger (Colors.red(`sendCommandToMasterAndWaiting process.send (comd) & listen [${cmd.cmd}] response TIMEOUT Error!`))
				resolve(null)
			}, 10000)

			const obj: snedMessageWaitingObj = {
				resolve,
				timeOutObj: timeSet
			}
			this.sendCommandWaitingPool.set(cmd.uuid, obj)
			
			return process.send (cmd)
		}
		return resolve(null)
	})

	private deleteConnetcing (key: string, n: Express.Response<any, Record<string, any>>) {
		//logger (Colors.grey(`delete liveness Connetcing ${key}:${ n.socket?.remoteAddress }`))
		this.livenessListeningPool.delete(key)
		return sendDisConnecting(key)
	}

	private stratliveness = () => {
		
		this.livenessListeningPool.forEach(async (n, key ) => {
			if (n.writable && !n.closed) {
				const returnData = {
					balance: 0,
					nodesBalance: [],
					masterBalance: 0
				}
				return n.write( JSON.stringify(returnData)+'\r\n\r\n', err => {
					if (err) {
						return this.deleteConnetcing(key, n)
					}
					// logger (Colors.grey(`stratliveness send request to ${key}`))
				})
			}
			
			return this.deleteConnetcing(key, n)
		})
	}

	public onMessage = (message: clusterMessage) => {
		if (message.uuid) {
			const obj = this.sendCommandWaitingPool.get (message.uuid)
			if (obj) {
				clearTimeout(obj.timeOutObj)
				this.sendCommandWaitingPool.delete(message.uuid)
				return obj.resolve(message)
			}
		}
		switch (message.cmd) {
			case 'si-node': {
				this.si_pool = message.data[0]
				return logger (Colors.gray(`onMessage si-node [${this.si_pool.length}]`))
			}

			case 'livenessStart': {
				this.si_pool = message.data[0]
				if (message.data[1]) {
					this.masterBalance = message.data[1]
				}

				this.stratliveness()
				return logger (Colors.cyan(`onMessage livenessStart! uuid[${this.livenessHash}] to [${this.livenessListeningPool.size}] clients !`))
			}

			case 'stop-liveness': {
				const obj: minerObj = message.data[0]
				if (obj && obj.walletAddress) {

					const res = this.livenessListeningPool.get(obj.walletAddress)
					if (res) {
						this.livenessListeningPool.delete(obj.walletAddress)
						res.end()
						logger(Colors.grey(`On Message stop-liveness from cli STOP res [${obj.walletAddress }]`))
					}
				}
				return
			}
			
			default: {
				return logger (Colors.cyan(`Got unknow message from Master`), inspect(message, false, 3, true))
			}
		}
	}

	private initSetupData = async () => {

		const setup = join( homedir(),'.master.json' )
		
		this.initData = await getSetup ( true )
		if ( !this.initData ) {
			throw new Error (`getSetup had null ERROR!`)
		}

		this.initData.keyObj = await loadWalletAddress (this.initData.keychain )

		await makePgpKeyObj ( this.initData.pgpKeyObj )

		this.appsPath = this.initData.setupPath
		this.PORT = this.initData.ipV4Port

        logger (`start local server!`)
		this.masterBalance = await getCNTPMastersBalance(masterSetup.conetPointAdmin)
		this.startServer()
	}

	constructor () {
		this.initSetupData ()
    }

	private ipaddressPool: Map<string, number[]>  = new Map()

	private startServer = () => {
		const staticFolder = join ( this.appsPath, 'static' )
		const launcherFolder = join ( this.appsPath, 'launcher' )
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use( Cors ())
		app.use ( Express.static ( staticFolder ))
        app.use ( Express.static ( launcherFolder ))
        app.use ( Express.json())
		app.use (async (req, res, next) => {

			const ipaddress = getIpAddressFromForwardHeader(req)
			if (!ipaddress) {
				res.status(404).end()
				return res.socket?.end().destroy()
			}

			const cmd: clusterMessage = {
				cmd:'attackcheck',
				data: [ipaddress],
				uuid: v4(),
				err: null
			}

			const response: clusterMessage|null = await this.sendCommandToMasterAndWaiting(cmd)
			if (response) {
				if (response.data[0]) {
					logger(Colors.red(`Server at attack by [${ipaddress}]!`))
					return res.status(404).end()
				}
				return next()
			}
			logger(Colors.blue(`message send to cluster can't get response! Pass [${ipaddress}]`))
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
		// const server = createServer({
		// 	key: privateKey,
		// 	cert: certificate
		// }, app)

		const server = createServerForDebug({

		}, app)


		this.router (router)

		app.all ('*', (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			//logger (Colors.red(`get unknow router from ${ipaddress} => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end ()
			return res.socket?.end().destroy()
		})

		server.listen(this.PORT,'0.0.0.0', () => {
			return console.table([
                { 'CoNET DL': `version ${version} startup success ${ this.PORT }` }
            ])
		})
		// this.localserver = createServer (option, app ).listen (this.PORT, async () => {
			
        //     return console.table([
        //         { 'CoNET DL node ': `mvp-dl version [${ version } Worker , Url: http://${ this.initData?.ipV4 }:${ this.PORT }, local-path = [${ staticFolder }]` }
        //     ])
        // })
	
	}

	private router ( router: Router ) {
		
		// router.get ('/liveness-answer', async (req, res) =>{
		// 	const [message, signMessage] = req.body?.message
		// 	if (!message||!this.initData||!signMessage) {
		// 		res.status(404).end()
		// 		return res.socket?.end().destroy()
		// 	}

		// 	const obj = checkSignObj (message, signMessage)
		// 	if (!obj) {
		// 		res.status(404).end()
		// 		return res.socket?.end().destroy()
		// 	}
			
		// 	const ipaddress = getIpAddressFromForwardHeader(req)
		// 	if (!ipaddress) {
		// 		res.status(404).end()
		// 		return res.socket?.end().destroy()
		// 	}

		// 	obj.ipAddress = ipaddress
		// 	const comd: clusterMessage = {
		// 		cmd:'livenessListening',
		// 		data: [obj],
		// 		uuid: v4(),
		// 		err: null
		// 	}

		// 	await this.sendCommandToMasterAndWaiting(comd)

		// })


		router.get ('/publishGPGKeyArmored', async (req,res) => {

			if (!this.initData) {
				logger (Colors.red(`conet_dl_server /publishKey have no initData! response 404`))
				res.status (404).end()
				return res.socket?.end().destroy()
			}
			
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(` Router /publishKey form [${ ipaddress}]`))

			res.json ({ publishGPGKey: this.initData.pgpKeyObj.publicKeyArmored }).end()
			return res.socket?.end().destroy()

		})

		router.post ('/newBlock', async (req,res) => {
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage
			} catch (ex) {
				logger (Colors.red(`${req.ip} request /livenessListening message = req.body.message ERROR!`))
				return res.status(404)
				
			}
			if (!message || !signMessage) {
				logger (Colors.red(`Router /newBlock has not  !message || !signMessage Error!`))
				res.status(404).end ()
				return res.socket?.end().destroy() 
			}
			const obj = checkSign (message, signMessage, '0x80E5C4c2e85b946515a8FaEe5C1D52Ac630350B1')
			if (!obj||!obj.blockNumber) {
				logger (Colors.red(`Router /newBlock checkSignObj Error!`), message, obj)
				res.status(404).end ()
				return res.socket?.end().destroy() 
			}
			
			const ipaddress = getIpAddressFromForwardHeader(req)

			const blockNumber = obj.blockNumber
			logger (Colors.blue (`Router /newBlock blockNumber = [${blockNumber}] headers ${inspect(ipaddress, false, 3, true)}`))
			res.sendStatus(200).end()

			const comd: clusterMessage = {
				cmd:'newBlock',
				data: [blockNumber],
				uuid: '',
				err: null
			}
			if ( process.connected && typeof process.send === 'function') {
				return process.send (comd)
			}
			logger (Colors.red (`Router /newBlock !(process.connected && typeof process.send === 'function') ERROR!`))
			
		})

		router.get ('/conet-price', async (req,res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.blue(`Router /conet-price to [${ ipaddress }]`))
			const prices = await getLast5Price ()
			logger (inspect(prices, false, 3, true))
			res.json (prices).end()
			return res.socket?.end().destroy()

		})

		router.post ('/stop-liveness', async (req,res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			// const ipaddress = req.headers['cf-connecting-ip']||splitIpAddr(req.ip)
			
			
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /stop-liveness message = req.body.message ERROR!`))
				return res.status(404).end()
				
			}
			
			if (!message||!this.initData||!signMessage) {
				logger (Colors.grey(`Router /stop-liveness !message||!this.initData||!signMessage Error!`))
				return  res.status(404).end()
				
			}

			const obj = checkSignObj (message, signMessage)

			if (!obj) {
				logger (Colors.grey(`Router/stop-liveness !obj Error!`))
				return res.status(404).end()
			}


			if (!ipaddress) {
				logger (Colors.grey(`Router /stop-liveness !ipaddress Error!`))
				return res.status(404).end()
			}
			res.end()
			obj.ipAddress = ipaddress
			const cmd: clusterMessage = {
				cmd:'stop-liveness',
				data: [obj],
				uuid: v4(),
				err: null
			}
			
			if ( process.connected && typeof process.send === 'function') {
				return process.send (cmd)
			}
			const clientRes = this.livenessListeningPool.get(obj.walletAddress)

			if (clientRes) {
				this.livenessListeningPool.delete(obj.walletAddress)
				clientRes.end()
			}
			return 
		})

		router.post ('/conet-si-node-register', async ( req, res ) => {
			const pgpMessage = req.body?.pgpMessage
			const ipaddress = getIpAddressFromForwardHeader(req)
			if ( !pgpMessage || !this.initData) {
				logger (Colors.red(`/conet-si-node-register has unknow payload [${ipaddress}]`), inspect(req.body, false, 3, true))
				res.status(404).end ()
				return res.socket?.end().destroy()
			}

			const obj = <ICoNET_DL_POST_register_SI> await decryptPgpMessage (pgpMessage, this.initData.pgpKeyObj.privateKeyObj)

			if (!obj || !ipaddress ) {
				logger (Colors.red(`[${ipaddress}] => /conet-si-node-register decryptPgpMessage or no ipaddress {${ipaddress}} ERROR!`), inspect(req.body , false, 3, true))
				res.status(404).end ()
				return res.socket?.end().destroy()
			}
			obj.ipV4 = ipaddress
			const ret = await CoNET_SI_Register ( obj)

			if (!ret ) {
				logger (Colors.red(`[${ ipaddress }] => /conet-si-node-register CoNET_SI_Register return null ERROR`))
				res.status(404).end()
				return res.socket?.end().destroy()
			}

			res.json ({ nft_tokenid: ret }).end()
			return res.socket?.end().destroy()
			
		})
		
		router.post('/si-health', async (req, res) => {
			
			const pgpMessage = req.body?.pgpMessage
			const ipaddress = getIpAddressFromForwardHeader(req)
			if ( !pgpMessage) {
				logger (Colors.red(`[${ipaddress}] ==> /si-health has unknow payload `), inspect(req.body, false, 3, true))
				return res.status(404).end ()
			}

			const obj = await decryptPgpMessage (pgpMessage, this.initData?.pgpKeyObj.privateKeyObj)

			if (!obj || !ipaddress) {
				logger (Colors.red(`[${ipaddress}] => /si-health decryptPgpMessage || null ipaddress [${ipaddress}] ERROR!`), inspect(req.body, false, 3, true))
				return res.status(404).end ()
				
			}

				// @ts-ignore
			const hObj: ICoNET_DL_POST_register_SI = obj
			hObj.ipV4 = ipaddress
			const ret = await CoNET_SI_health ( hObj )

			if ( !ret ) {
				logger (Colors.red(`/si-health from ${ipaddress} has none message && signature ERROR!`), inspect( req.body, false, 3, true ))
				logger (`/si-health CoNET_SI_health ERROR!`)
				return res.status(404).end ()
				
			}

			logger (Colors.grey(`[${ipaddress}] ==> /si-health SUCCESS!`))
			return res.json (this.si_pool).end()
			
		})

		router.post ('/myIpaddress', (req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			return res.json ({ipaddress}).end ()
		})

		router.post ('/conet-faucet', (req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			// logger (Colors.grey(`Router /conet-faucet to [${ ipaddress }]`))
			const wallet_add = req.body?.walletAddr

			if (!wallet_add ||!ipaddress) {
				logger (`POST /conet-faucet ERROR! Have no walletAddr [${ipaddress}]`, inspect(req.body, false, 3, true))
				res.status(400).end()
				return res.socket?.end().destroy()
			}

			return regiestFaucet(wallet_add, ipaddress).then (n => {
				if (!n) {
					res.status(400).end()
					return res.socket?.end().destroy()
				}
				return res.json ().end ()
			})

		})

		router.post ('/conet-si-list', async ( req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			//logger (Colors.grey(`POST ${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }]`), inspect(this.si_pool[0], false, 2, true))
			res.json(this.si_pool).end()
		})

		router.get ('/conet-nodes', async ( req, res ) => {
			res.json({node:this.si_pool, masterBalance: this.masterBalance}).end()
		})

		// router.post ('/authorizeCoNETCash', async (req, res ) => {
		// 	const CoNETCash_authorizedObj = req.body?.CoNETCash_authorizedObj
		// 	const authorizedObjHash = req.body?.authorizedObjHash
		// 	const sign = req.body?.sign

		// 	if (!CoNETCash_authorizedObj||!authorizedObjHash||!sign) {
		// 		res.status(404).end()
		// 		res.socket?.end().destroy()
		// 		return logger (`/authorizeCoNETCash [${ splitIpAddr (req.ip) }] have no correct parameters!`, inspect(req.body, false, 3, true))
		// 	}
		// 	logger (Colors.blue (`/authorizeCoNETCash from [${ splitIpAddr (req.ip) }] call authorizeCoNETCash`))
		// 	logger (inspect(req.body, false, 3, true ))
		// 	const ret = await authorizeCoNETCash (CoNETCash_authorizedObj, authorizedObjHash, sign)
		// 	if (!ret) {
		// 		res.status(400).end()
		// 		return res.socket?.end().destroy()
		// 	}
		// 	res.json ({id: ret}).end ()
		// 	return res.socket?.end().destroy()
		// })

		router.post ('/livenessListening', async (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			// const ipaddress = req.headers['cf-connecting-ip']||splitIpAddr(req.ip)
			
			
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /livenessListening message = req.body.message ERROR!`))
				return res.status(404).end()
				
			}
			
			if (!message||!this.initData||!signMessage) {
				logger (Colors.grey(`Router /livenessListening !message||!this.initData||!signMessage Error!`))
				return  res.status(404).end()
				
			}

			const obj = checkSignObj (message, signMessage)

			if (!obj) {
				logger (Colors.grey(`[${ipaddress}] to /livenessListening !obj Error!`))
				return res.status(404).end()
			}

			const index = listedServerIpAddress.findIndex(n => n.ipaddress === ipaddress)

			if (!ipaddress || index > -1) {
				logger (Colors.grey(`[${ipaddress}] /livenessListening !ipaddress Error!`))
				return res.status(404).end()
			}
			
			obj.ipAddress = typeof ipaddress === 'string' ? ipaddress : ipaddress[0]
			
			const comd: clusterMessage = {
				cmd:'livenessStart',
				data: [obj],
				uuid: v4(),
				err: null
			}
			logger(Colors.grey(`[${obj.ipAddress}] /livenessListening`))
			const responObj = await this.sendCommandToMasterAndWaiting(comd)

			if (!responObj) {
				logger (Colors.grey(`[${ipaddress}] /livenessListening !responObj Error!`))
				return res.status(404).end()
			}

			if (responObj.err) {
				logger (Colors.grey(`[${ipaddress}] /livenessListening has [${responObj.err}] Error!`))
				switch (responObj.err) {
					
					case 'different IP': {
						
						return res.status(401).end()
						
					}
					case 'has connecting': {
						return res.status(402).end()
					}
					default :{
						return res.status(403).end()
					}
				}
			}
			
			//		Listening desconnect


			res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Connection', 'keep-alive')
            res.flushHeaders() // flush the headers to establish SSE with client
			const returnData = {
				balance: 0,
				ipaddress: obj.ipAddress
			}
			res.write(JSON.stringify (returnData)+'\r\n\r\n')
			//logger (Colors.blue(`Router /livenessListening [${ipaddress}:${ obj.walletAddress }] SUCCESS!`))
			return this.livenessListeningPool.set(obj.walletAddress, res)
			
		})

		router.post ('/regiestProfileRoute', async (req, res ) => {

			const ipaddress = getIpAddressFromForwardHeader(req)
			const pgpMessage = req.body?.pgpMessage

			if ( !pgpMessage?.length || !this.initData) {
				logger (Colors.red(`Router /regiestProfileRouter [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] pgpMessage null Error!`))
				res.status(404).end()
				return res.socket?.end().destroy()
			}

			let obj = <ICoNET_Profile|null> await decryptPgpMessage (pgpMessage, this.initData.pgpKeyObj.privateKeyObj)

			if (!obj) {
				logger (Colors.red(`Router /regiestProfileRoute [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] decryptPgpMessage Error!`))
				res.status(400).end()
				return res.socket?.end().destroy()
			}

			const obj1 = await decryptPayload (obj)
			if ( !obj1 ) {
				res.status(400).end()
				return res.socket?.end().destroy()
			}
			logger(Colors.gray(``))
			return res.json({}).end()
			
			// await postRouterToPublic (null, obj1, this.s3pass)

		})

		router.post ('/registerReferrer', async (req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			const obj = checkSignObj (message, signMessage)
			if (!obj || !obj?.referrer || obj.walletAddress === undefined || obj.referrer === undefined ||obj.walletAddress === obj.referrer) {
				logger (Colors.grey(`Router /registerReferrer !obj Error! ${ipaddress} `))
				return res.status(404).end()
			}

			const cmd: clusterMessage = {
				cmd:'registerReferrer',
				data: [obj, ipaddress],
				uuid: v4(),
				err: null
			}
			const response = await this.sendCommandToMasterAndWaiting(cmd)

			if (!response ) {
				logger(Colors.grey(`/registerReferrer [${ obj.walletAddress }] waiting sendCommandToMasterAndWaiting TIMEOUT!`))
				return res.status(403).end() 
			}
			logger(Colors.grey(`/registerReferrer [${ obj.walletAddress }] SUCCESS!`))
			return res.json({referrer: obj.referrer}).end()
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