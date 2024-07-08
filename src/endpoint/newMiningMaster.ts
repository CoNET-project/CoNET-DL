/**
 * 			
 * */
import Express, { Router, Response, Request } from 'express'
import { inspect } from 'node:util'
import Colors from 'colors/safe'
import Cluster from 'node:cluster'
const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`
import {createServer} from 'node:http'
import {getAllMinerNodes, getIpAddressFromForwardHeader} from './help-database'
import {checkSignObj} from '../util/util'
import {logger} from '../util/logger'

import type { RequestOptions } from 'node:http'
import {request} from 'node:http'


const postLocalhost = async (path: string, obj: minerObj, _res: Response)=> {
	
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
		
		let chunk = ''
		
		res.on('data', data => {
			chunk += data
		})

		res.once ('end', () => {
			logger(Colors.grey(`postLocalhost ${path} got response [${res.statusCode}] pipe to res`), inspect(chunk, false,3, true))
			_res.status(res.statusCode||404).write(chunk)
			_res.end()
		})
		
	})

	req.once('error', (e) => {
		console.error(`getReferrer req on Error! ${e.message}`)
		_res.status(502).end()
	})

	req.write(JSON.stringify(obj))
	req.end()
}
let initdataing = false
const initdata = async (regiestNodes: Map<string, string>) => {
	if (initdataing) {
		return 
	}
	initdataing = true
	const nodes: any[]|void  = await getAllMinerNodes()
	if (!nodes) {
		initdataing = false
		return logger(Colors.red(`initdata return NULL! `))
	}
	
	nodes.forEach(n => {
		const w = n.wallet.toLowerCase()
		// if (w === testNodeWallet) {
		// 	return
		// }
		
		regiestNodes.set(n.wallet, n.node_ipaddress)
		
	})

	logger(Colors.blue(`Daemon initdata regiestNodes = ${inspect(regiestNodes.entries(), false, 3, true)}`))
	initdataing = false
}

const checkNode = async (req: Request, regiestNodes: Map<string, string>) => {
	const ipaddress = getIpAddressFromForwardHeader(req)
	const request = req.path
	let message, signMessage
	try {
		message = req.body.message
		signMessage = req.body.signMessage

	} catch (ex) {
		logger (Colors.grey(`${ipaddress} request ${request} message = req.body.message ERROR! ${inspect(req.body, false, 3, true)}`))
		return false
	}

	if (!message||!signMessage||!ipaddress) {
		logger (Colors.grey(`${ipaddress} request ${request} !message||!signMessage Error! [${ipaddress}]`))
		return false
	}

	const obj = checkSignObj (message, signMessage)

	// if (!obj || !obj?.data && (!obj?.ipAddress || !obj?.walletAddress1)) {
	// 	logger (Colors.grey(`${ipaddress} request ${request} !obj Error! ${inspect(obj, false, 3, true)}`))
	// 	return false
	// }

	//logger(Colors.red(`[${request}] checkNode checkSignObj!`))
	if (!obj) {
		logger (Colors.grey(`${ipaddress} request ${request} !obj Error! ${inspect(obj, false, 3, true)}`))
		return false
	}

	let _ip = regiestNodes.get (obj.walletAddress)

	if (!_ip) {
		logger(Colors.red(`[${request}] walletAddress [${obj.walletAddress}] checkNode _ip is empty`))
		await initdata(regiestNodes)
		_ip = regiestNodes.get (obj.walletAddress)

	}
	if (!_ip || _ip !== ipaddress) {
		logger (Colors.grey(`request ${request} [${ipaddress}:${obj.walletAddress}] wallet or IP address didn't match nodes regiested IP address _ip [${_ip}]`))
		return false
	}
	//logger(Colors.grey(`[${ req.path }]checkNode return obj!`), inspect(obj, false, 3, true))
	return obj
}


class conet_dl_v3_server {

	private PORT = 8001
	public regiestNodes: Map<string, string> = new Map()
	constructor () {
		this.startServer()
    }

	private startServer = async () => {
		
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use( Cors ())
		app.use(Express.json())
		app.use( '/api', router )
		
		app.use(Express.json({limit: '1mb'}));
		// app.use(Express.urlencoded({limit: '100mb'}));
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

		app.use (async (req, res, next) => {
			if (/^post$/i.test(req.method)) {
				return Express.json({limit: '1mb'})(req, res, err => {
					if (err) {
						res.sendStatus(400).end()
						res.socket?.end().destroy()
						return logger(Colors.red(`/^post$/i.test Express.json Error ${req.url} ! ${JSON.stringify(req.body)}`))
						
					}
					return next()
				})
			}
			return next()
		})

		const server = createServer(app)

		this.router (router)

		app.all ('*', (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.red(`get unknow router from ${ipaddress} => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end ()
			return res.socket?.end().destroy()
		})

		server.listen(this.PORT, '0.0.0.0',() => {
			return console.table([
                { 'newMiningCluster': ` startup success ${ this.PORT } Work [${workerNumber}]` }
            ])
		})
	}

	private router ( router: Router ) {
		
		router.post('/minerCheck',  async (req, res) => {
			
			const obj = await checkNode(req, this.regiestNodes)

			if (!obj || !obj?.ipAddress || !obj?.walletAddress1) {
				logger(Colors.red(`/minerCheck obj format Error`), inspect(obj, false, 3, true))
				return res.status(404).end()
			}

			return postLocalhost('/api/minerCheck', obj, res)
		})

		router.post('/deleteMiner',  async (req, res) =>{
			const obj = await checkNode(req, this.regiestNodes)

			if (!obj || !obj?.ipAddress || !obj?.walletAddress1) {
				logger(Colors.red(`/deleteMiner obj format Error`), inspect(obj, false, 3, true))
				return res.status(404).end()
			}

			return postLocalhost('/api/deleteMiner', obj, res)
		})

		router.post('/nodeRestart',  async (req, res) => {

			const obj = await checkNode(req, this.regiestNodes)
			if (!obj) {
				logger(`/nodeRestart obj Error!`)
				res.status(404).end()
				return logger(Colors.blue(`/nodeRestart checkNode error!`))
			}

			let data:minerArray[] = obj?.data

			if (!data) {
				res.status(404).end()
				return logger(Colors.red(`/nodeRestart hasn't include data error!`))
			}
			
			logger(Colors.blue(`forward /api/nodeRestart to cluster daemon`))
			return postLocalhost('/api/nodeRestart', obj, res)
		})

		router.post('/getTotalMiners',  async (req, res) => {

			const obj = await checkNode(req, this.regiestNodes)

			if (!obj) {
				res.status(404).end()
				return logger(Colors.red(`/getTotalMiners checkNode error!`))
			}

			return postLocalhost('/api/getTotalMiners', obj, res)
		})

		router.all ('*', (req, res ) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`[${ipaddress}] => Router /api get unknow router [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

export default conet_dl_v3_server