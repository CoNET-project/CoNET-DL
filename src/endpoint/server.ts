/**
 * 			
 * */
import Express, { Router } from 'express'

import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { CoNET_SI_Register, regiestFaucet, getLast5Price,
	CoNET_SI_health, getIpAttack, getOraclePrice, txManager, freeMinerManager,
	startListeningCONET_Holesky_EPOCH, addIpaddressToLivenessListeningPool, claimeToekn, regiestApiNode1
} from './help-database'
import Colors from 'colors/safe'
import { homedir } from 'node:os'
import {v4} from 'uuid'
import Cluster from 'node:cluster'
import {readFileSync} from 'node:fs'
import { logger, checkErc20Tx, checkValueOfGuardianPlan, checkTx, getAssetERC20Address, checkReferralsV2_OnCONET_Holesky,
	returnGuardianPlanReferral, CONET_guardian_Address, loadWalletAddress, getSetup, return404, 
	decryptPayload, decryptPgpMessage, makePgpKeyObj, checkSignObj, getNetworkName,
	checkSign, getCNTPMastersBalance, listedServerIpAddress, getServerIPV4Address, s3fsPasswd, storageWalletProfile, conet_Holesky_rpc, addAttackToCluster
} from '../util/util'

const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`


//	for production
	import {createServer} from 'node:http'

//	for debug
	// import {createServer as createServerForDebug} from 'node:http'

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
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}




class conet_dl_server {

	private PORT = masterSetup.PORT|| 8000
	private appsPath = ''
	private initData: ICoNET_NodeSetup|null = null
	private debug = false
	private serverID = ''

	private si_pool: nodeType[] = []

	private sendCommandWaitingPool: Map <string, snedMessageWaitingObj> = new Map()
	private livenessHash = ''
	private masterBalance: CNTPMasterBalance|null = null
	private s3Pass: s3pass|null = null
	private minerRate = 0
	private EPOCH = '0'
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



	private initSetupData = async () => {
		
		this.initData = await getSetup ( true )
		if ( !this.initData ) {
			throw new Error (`getSetup had null ERROR!`)
		}

		this.initData.keyObj = await loadWalletAddress (this.initData.keychain )

		await makePgpKeyObj ( this.initData.pgpKeyObj )

		this.appsPath = this.initData.setupPath

        logger (Colors.blue(`start local server!`))
		this.masterBalance = await getCNTPMastersBalance(masterSetup.conetPointAdmin)
		this.serverID = getServerIPV4Address(false)[0]
		logger(Colors.blue(`serverID = [${this.serverID}]`))
		this.s3Pass = await s3fsPasswd()
		await regiestApiNode1 ()
		
		this.startServer()

		startListeningCONET_Holesky_EPOCH()
	}

	constructor () {
		this.initSetupData ()
    }

	private ipaddressPool: Map<string, number[]>  = new Map()

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
				res.status(404).end()
				return res.socket?.end().destroy()
			}
				
			if (/^post$/i.test(req.method)) {
				
				return Express.json ({limit: '25mb'}) (req, res, async err => {
					if (err) {
						logger(Colors.red(`[${ipaddress}] ${req.method} => ${req.url} Express.json Error! ATTACK stop request`))
						res.sendStatus(400).end()
						res.socket?.end().destroy()
						return await addAttackToCluster (ipaddress)
						
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
			//logger (Colors.red(`get unknow router from ${ipaddress} => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end ()
			return res.socket?.end().destroy()
		})

		server.listen ( this.PORT, '0.0.0.0', () => {
			return console.table([
                { 'CoNET DL': `version ${version} startup success ${ this.PORT } Work [${workerNumber}]` }
            ])
		})
		
	}

	private router ( router: Router ) {


		router.get ('/health', async (req,res) => {

			if (!this.initData) {
				logger (Colors.red(`conet_dl_server /publishKey have no initData! response 404`))
				res.status (404).end()
				return res.socket?.end().destroy()
			}
			
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(` Router /health form [${ ipaddress}]`), inspect(req.headers, false, 3, true))

			return res.json ({ health: true }).end()

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
			
			obj.ipAddress = ipaddress
			const cmd: clusterMessage = {
				cmd:'stop-liveness',
				data: [obj],
				uuid: v4(),
				err: null
			}
			logger(Colors.grey(`[${obj.ipAddress}] /stop-liveness`))
			if ( process.connected && typeof process.send === 'function') {
				process.send (cmd)
			}
			
			return res.status(200).end()
		})
		

		router.post ('/startMining', async (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
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



			const m = await freeMinerManager(ipaddress, obj.walletAddress)

			if (m !== true) {
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
			res.flush()
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
